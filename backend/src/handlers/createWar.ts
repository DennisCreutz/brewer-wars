import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLE_NAME, warPk, WAR_SK, listIndexSk, LIST_ALL_PK, userPk } from '../lib/dynamo.js'
import { withErrorHandling, json, parseBody, HttpError } from '../lib/http.js'
import { getAuthContext, requireAdmin } from '../lib/auth.js'
import { extractSummaryFields, assertWithinSizeLimit } from '../lib/warSummary.js'

export const handler = withErrorHandling(async (event) => {
  const auth = getAuthContext(event)
  requireAdmin(auth)

  const war = parseBody<unknown>(event)
  const summary = extractSummaryFields(war)
  const docString = JSON.stringify(war)
  assertWithinSizeLimit(docString)

  const pk = warPk(summary.id)
  const sk = listIndexSk(summary.createdAt, summary.id)

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE_NAME,
              Item: {
                PK: pk,
                SK: WAR_SK,
                id: summary.id,
                phase: summary.phase,
                playerNames: summary.playerNames,
                createdAt: summary.createdAt,
                updatedAt: summary.updatedAt,
                ownerSub: auth.sub,
                version: 1,
                schemaVersion: 1,
                doc: docString,
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Put: {
              TableName: TABLE_NAME,
              Item: { PK: LIST_ALL_PK, SK: sk },
            },
          },
          {
            Put: {
              TableName: TABLE_NAME,
              Item: { PK: userPk(auth.sub), SK: sk },
            },
          },
        ],
      }),
    )
  } catch (err) {
    if (err instanceof Error && err.name === 'TransactionCanceledException') {
      throw new HttpError(409, 'A war with this id already exists')
    }
    throw err
  }

  return json(201, { war, version: 1 })
})
