import { QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLE_NAME, userPk } from '../lib/dynamo.js'
import { withErrorHandling, json } from '../lib/http.js'
import { getAuthContext } from '../lib/auth.js'

export const handler = withErrorHandling(async (event) => {
  const auth = getAuthContext(event)

  // Members only see wars they actually belong to (host or assigned
  // player) — the per-user index item written at war creation for every
  // member (see createWar.ts) is what makes this query possible.
  const indexResult = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': userPk(auth.sub) },
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
