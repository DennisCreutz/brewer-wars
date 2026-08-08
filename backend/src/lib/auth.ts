import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda'

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message)
  }
}

export interface AuthContext {
  sub: string
  groups: string[]
  isAdmin: boolean
}

export function getAuthContext(event: APIGatewayProxyEventV2WithJWTAuthorizer): AuthContext {
  const claims = event.requestContext.authorizer?.jwt?.claims
  if (!claims) {
    throw new HttpError(401, 'Missing authorization claims')
  }
  const sub = typeof claims.sub === 'string' ? claims.sub : undefined
  if (!sub) {
    throw new HttpError(401, 'Token has no subject claim')
  }
  const rawGroups = claims['cognito:groups']
  const groups = Array.isArray(rawGroups)
    ? rawGroups.map(String)
    : typeof rawGroups === 'string'
      ? rawGroups.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean)
      : []
  return { sub, groups, isAdmin: groups.includes('admins') }
}

export function requireAdmin(auth: AuthContext): void {
  if (!auth.isAdmin) {
    throw new HttpError(403, 'Only admins may perform this action')
  }
}
