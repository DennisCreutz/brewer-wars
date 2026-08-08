import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLE_NAME, warPk, WAR_SK } from '../lib/dynamo.js'
import { withErrorHandling, json, parseBody, HttpError } from '../lib/http.js'
import { getAuthContext } from '../lib/auth.js'
import { extractSummaryFields, assertWithinSizeLimit } from '../lib/warSummary.js'

export const handler = withErrorHandling(async (event) => {
  getAuthContext(event) // any signed-in user may update a war

  const warId = event.pathParameters?.warId
  if (!warId) {
    throw new HttpError(400, 'Missing warId path parameter')
  }

  const key = { PK: warPk(warId), SK: WAR_SK }

  const existing = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: key }))
  if (!existing.Item) {
    throw new HttpError(404, 'War not found')
  }

  const ifMatch = event.headers?.['if-match'] ?? event.headers?.['If-Match']
  if (ifMatch !== undefined) {
    const expectedVersion = Number(ifMatch)
    if (Number.isNaN(expectedVersion)) {
      throw new HttpError(400, 'If-Match header must be a numeric version')
    }
    if (existing.Item.version !== expectedVersion) {
      throw new HttpError(412, 'War was modified by someone else; reload and retry')
    }
  }

  const war = parseBody<unknown>(event)
  const summary = extractSummaryFields(war)
  if (summary.id !== warId) {
    throw new HttpError(400, 'War id in body does not match warId in path')
  }
  const docString = JSON.stringify(war)
  assertWithinSizeLimit(docString)

  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: key,
        UpdateExpression:
          'SET phase = :phase, playerNames = :playerNames, updatedAt = :updatedAt, doc = :doc, version = version + :one',
        ConditionExpression: 'version = :currentVersion',
        ExpressionAttributeValues: {
          ':phase': summary.phase,
          ':playerNames': summary.playerNames,
          ':updatedAt': summary.updatedAt,
          ':doc': docString,
          ':one': 1,
          ':currentVersion': existing.Item.version,
        },
        ReturnValues: 'ALL_NEW',
      }),
    )

    return json(200, { war, version: result.Attributes?.version as number })
  } catch (err) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      throw new HttpError(412, 'War was modified by someone else; reload and retry')
    }
    throw err
  }
})
