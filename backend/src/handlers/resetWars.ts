import { QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
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

  const deleteRequests = items.flatMap((item) => {
    const sk = String(item.SK)
    const warId = sk.split('#')[2]
    return [
      { DeleteRequest: { Key: { PK: `WAR#${warId}`, SK: 'META' } } },
      { DeleteRequest: { Key: { PK: LIST_ALL_PK, SK: sk } } },
      { DeleteRequest: { Key: { PK: userPk(auth.sub), SK: sk } } },
    ]
  })

  for (let i = 0; i < deleteRequests.length; i += BATCH_SIZE) {
    const chunk = deleteRequests.slice(i, i + BATCH_SIZE)
    await ddb.send(new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: chunk } }))
  }

  return json(204, null)
})
