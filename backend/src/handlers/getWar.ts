import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLE_NAME, warPk, WAR_SK } from '../lib/dynamo.js'
import { withErrorHandling, json, HttpError } from '../lib/http.js'
import { getAuthContext } from '../lib/auth.js'

export const handler = withErrorHandling(async (event) => {
  const auth = getAuthContext(event)

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

  const memberUserIds: string[] = Array.isArray(result.Item.memberUserIds)
    ? result.Item.memberUserIds.map(String)
    : [String(result.Item.ownerSub)]
  if (!memberUserIds.includes(auth.sub) && !auth.isAdmin) {
    throw new HttpError(403, 'You are not a member of this war')
  }

  const war: unknown = JSON.parse(result.Item.doc as string)

  return json(200, { war, version: result.Item.version as number })
})
