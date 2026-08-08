import { QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLE_NAME, LIST_ALL_PK } from '../lib/dynamo.js'
import { withErrorHandling, json } from '../lib/http.js'
import { getAuthContext } from '../lib/auth.js'

export const handler = withErrorHandling(async (event) => {
  getAuthContext(event) // any signed-in user may list wars

  const indexResult = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': LIST_ALL_PK },
      ScanIndexForward: false,
    }),
  )

  const keys = (indexResult.Items ?? []).map((item) => {
    const warId = String(item.SK).split('#')[2]
    return { PK: `WAR#${warId}`, SK: 'META' }
  })

  if (keys.length === 0) {
    return json(200, { wars: [] })
  }

  const batch = await ddb.send(
    new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: {
          Keys: keys,
          ProjectionExpression: 'id, phase, playerNames, createdAt, updatedAt',
        },
      },
    }),
  )

  const items = batch.Responses?.[TABLE_NAME] ?? []
  const wars = items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))

  return json(200, { wars })
})
