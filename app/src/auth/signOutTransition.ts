// Module-level (not React state) so `RequireAuth`'s effect — which runs in
// a totally separate component, possibly re-rendered by the very
// `auth.removeUser()` call this guards against — can synchronously check
// it without waiting on a state update/re-render cycle.
let signingOut = false

/** True from the moment `useSignOut`'s handler starts until the browser
 * actually navigates away to Cognito's hosted logout page. */
export function isSigningOut(): boolean {
  return signingOut
}

export function setSigningOut(value: boolean): void {
  signingOut = value
}
