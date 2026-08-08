import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLE_NAME, warPk, WAR_SK, listIndexSk, LIST_ALL_PK, userPk } from '../lib/dynamo.js'
import { withErrorHandling, json, HttpError } from '../lib/http.js'
import { getAuthContext } from '../lib/auth.js'

export const handler = withErrorHandling(async (event) => {
  const auth = getAuthContext(event)

  const warId = event.pathParameters?.warId
  if (!warId) {
    throw new HttpError(400, 'Missing warId path parameter')
  }

  const key = { PK: warPk(warId), SK: WAR_SK }
  const existing = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: key }))
  if (!existing.Item) {
    return json(204, null)
  }

  if (existing.Item.ownerSub !== auth.sub && !auth.isAdmin) {
    throw new HttpError(403, 'Only the owner or an admin may delete this war')
  }

  const sk = listIndexSk(String(existing.Item.createdAt), warId)
  const memberUserIds: string[] = Array.isArray(existing.Item.memberUserIds)
    ? existing.Item.memberUserIds.map(String)
    : [String(existing.Item.ownerSub)]

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        { Delete: { TableName: TABLE_NAME, Key: key } },
        { Delete: { TableName: TABLE_NAME, Key: { PK: LIST_ALL_PK, SK: sk } } },
        ...memberUserIds.map((memberSub) => ({
          Delete: { TableName: TABLE_NAME, Key: { PK: userPk(memberSub), SK: sk } },
        })),
      ],
    }),
  )

  return json(204, null)
})
