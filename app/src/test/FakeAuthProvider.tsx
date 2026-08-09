/**
 * Test helper: provides a fake authenticated react-oidc-context session
 * without going through real OIDC discovery/token exchange. Used by
 * component tests that render behind <RequireAuth> or read useIsAdmin().
 */
import type { ReactNode } from 'react'
import { AuthContext, type AuthContextProps } from 'react-oidc-context'
import type { User } from 'oidc-client-ts'

export function fakeAuthUser(groups: string[] = ['admins'], sub = 'test-user-sub'): User {
  return {
    access_token: 'test-access-token',
    id_token: 'test-id-token',
    token_type: 'Bearer',
    profile: {
      sub,
      email: 'test-user@example.com',
      'cognito:groups': groups,
    },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    scopes: ['openid', 'email', 'profile'],
    toStorageString: () => '{}',
  } as unknown as User
}

export function FakeAuthProvider({
  children,
  groups = ['admins'],
  sub = 'test-user-sub',
}: {
  children: ReactNode
  groups?: string[]
  sub?: string
}) {
  const value: AuthContextProps = {
    isLoading: false,
    isAuthenticated: true,
    user: fakeAuthUser(groups, sub),
    error: undefined,
    settings: {} as AuthContextProps['settings'],
    events: {} as AuthContextProps['events'],
    activeNavigator: undefined,
    signinRedirect: async () => {},
    signinResourceOwnerCredentials: async () => fakeAuthUser(groups),
    signinPopup: async () => fakeAuthUser(groups),
    signinSilent: async () => fakeAuthUser(groups),
    signoutRedirect: async () => {},
    signoutPopup: async () => {},
    signoutSilent: async () => {},
    querySessionStatus: async () => null,
    revokeTokens: async () => {},
    startSilentRenew: () => {},
    stopSilentRenew: () => {},
    clearStaleState: async () => {},
    removeUser: async () => {},
    signinCallback: async () => undefined,
    signoutCallback: async () => undefined,
  } as unknown as AuthContextProps

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
