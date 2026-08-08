import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLE_NAME, warPk, WAR_SK } from '../lib/dynamo.js'
import { withErrorHandling, json, HttpError } from '../lib/http.js'
import { getAuthContext } from '../lib/auth.js'

export const handler = withErrorHandling(async (event) => {
  getAuthContext(event) // any signed-in user may load a war

  const warId = event.pathParameters?.warId
  if (!warId) {
    throw new HttpError(400, 'Missing warId path parameter')
  }

  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: warPk(warId), SK: WAR_SK },
    }),
  )

  if (!result.Item) {
    throw new HttpError(404, 'War not found')
  }

  const war: unknown = JSON.parse(result.Item.doc as string)

  return json(200, { war, version: result.Item.version as number })
})
