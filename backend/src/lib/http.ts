import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda'
import { HttpError } from './auth.js'

export { HttpError } from './auth.js'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN ?? '*',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type,If-Match',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
}

export function json(statusCode: number, body: unknown, extraHeaders: Record<string, string> = {}): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  }
}

export type Handler = (event: APIGatewayProxyEventV2WithJWTAuthorizer) => Promise<APIGatewayProxyResultV2>

export function withErrorHandling(handler: Handler): Handler {
  return async (event) => {
    try {
      return await handler(event)
    } catch (err) {
      if (err instanceof HttpError) {
        return json(err.statusCode, { message: err.message })
      }
      console.error('Unhandled error', err)
      return json(500, { message: 'Internal server error' })
    }
  }
}

export function parseBody<T>(event: APIGatewayProxyEventV2WithJWTAuthorizer): T {
  if (!event.body) {
    throw new HttpError(400, 'Request body is required')
  }
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf-8') : event.body
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON')
  }
}
