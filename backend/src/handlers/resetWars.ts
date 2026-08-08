import { QueryCommand, BatchWriteCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLE_NAME, userPk, LIST_ALL_PK } from '../lib/dynamo.js'
import { withErrorHandling, json } from '../lib/http.js'
import { getAuthContext } from '../lib/auth.js'

const BATCH_SIZE = 25

export const handler = withErrorHandling(async (event) => {
  const auth = getAuthContext(event)

  const userIndex = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': userPk(auth.sub) },
    }),
  )

  const items = userIndex.Items ?? []
  if (items.length === 0) {
    return json(204, null)
  }

  const warIds = items.map((item) => String(item.SK).split('#')[2])

  // Every war being wiped may have other members besides the caller — look
  // up each war's full member list so their now-stale USER# index items
  // (which would otherwise point at a deleted war) are cleaned up too.
  const metaBatch = await ddb.send(
    new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: {
          Keys: warIds.map((warId) => ({ PK: `WAR#${warId}`, SK: 'META' })),
          ProjectionExpression: 'id, memberUserIds',
        },
      },
    }),
  )
  const memberUserIdsByWarId = new Map<string, string[]>(
    (metaBatch.Responses?.[TABLE_NAME] ?? []).map((item) => [
      String(item.id),
      Array.isArray(item.memberUserIds) ? item.memberUserIds.map(String) : [auth.sub],
    ]),
  )

  const deleteRequests = items.flatMap((item) => {
    const sk = String(item.SK)
    const warId = sk.split('#')[2]
    const memberUserIds = memberUserIdsByWarId.get(warId) ?? [auth.sub]
    return [
      { DeleteRequest: { Key: { PK: `WAR#${warId}`, SK: 'META' } } },
      { DeleteRequest: { Key: { PK: LIST_ALL_PK, SK: sk } } },
      ...memberUserIds.map((memberSub) => ({
        DeleteRequest: { Key: { PK: userPk(memberSub), SK: sk } },
      })),
    ]
  })

  for (let i = 0; i < deleteRequests.length; i += BATCH_SIZE) {
    const chunk = deleteRequests.slice(i, i + BATCH_SIZE)
    await ddb.send(new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: chunk } }))
  }

  return json(204, null)
})
