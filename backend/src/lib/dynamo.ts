import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({})

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
})

export const TABLE_NAME = process.env.TABLE_NAME ?? ''

if (!TABLE_NAME) {
  throw new Error('TABLE_NAME environment variable is not set')
}

export function warPk(warId: string): string {
  return `WAR#${warId}`
}

export const WAR_SK = 'META'

export function listIndexSk(createdAt: string, warId: string): string {
  return `WAR#${createdAt}#${warId}`
}

export const LIST_ALL_PK = 'LIST#ALL'

export function userPk(sub: string): string {
  return `USER#${sub}`
}
