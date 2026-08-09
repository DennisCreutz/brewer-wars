import { CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider'
import { withErrorHandling, json } from '../lib/http.js'
import { getAuthContext, requireAdmin } from '../lib/auth.js'

const cognito = new CognitoIdentityProviderClient({})

const USER_POOL_ID = process.env.USER_POOL_ID ?? ''
if (!USER_POOL_ID) {
  throw new Error('USER_POOL_ID environment variable is not set')
}

export interface UserSummary {
  sub: string
  email: string
  /** The account's `preferred_username` attribute, if an admin has set one
   * (see AGENTS.md-adjacent runbook: `aws cognito-idp
   * admin-update-user-attributes ... Name=preferred_username`). Absent for
   * accounts that haven't been given one yet — callers fall back to email. */
  username?: string
}

function attr(user: { Attributes?: { Name?: string; Value?: string }[] }, name: string): string | undefined {
  return user.Attributes?.find((a) => a.Name === name)?.Value
}

/** Lists every confirmed Cognito user in the pool, for the wizard's
 * hero-select player picker — admin-only, since only admins create wars.
 * Cognito's ListUsers is paginated (max 60/page); this app's pool is small
 * (players are hand-created by an admin) so looping until exhausted is
 * simple and cheap. */
export const handler = withErrorHandling(async (event) => {
  const auth = getAuthContext(event)
  requireAdmin(auth)

  const users: UserSummary[] = []
  let paginationToken: string | undefined

  do {
    const result = await cognito.send(
      new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        PaginationToken: paginationToken,
      }),
    )
    for (const user of result.Users ?? []) {
      const sub = attr(user, 'sub')
      const email = attr(user, 'email')
      const username = attr(user, 'preferred_username')
      if (sub && email) users.push({ sub, email, ...(username ? { username } : {}) })
    }
    paginationToken = result.PaginationToken
  } while (paginationToken)

  users.sort((a, b) => (a.username ?? a.email).localeCompare(b.username ?? b.email))

  return json(200, { users })
})
