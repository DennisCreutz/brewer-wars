/**
 * Runtime configuration, fetched once at app boot from /config.json.
 *
 * Values here are only known after the Terraform apply completes (API
 * domain, Cognito pool/client ids), so they cannot be Vite build-time env
 * vars without forcing a rebuild per deploy. Instead the same built bundle
 * is deployed everywhere and reads this file at runtime — see
 * infrastructure/modules/frontend and the deploy script that generates it.
 */
export interface RuntimeConfig {
  apiBaseUrl: string
  cognitoAuthority: string
  cognitoClientId: string
  cognitoDomain: string
}

let cached: RuntimeConfig | null = null

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (cached) return cached
  const res = await fetch('/config.json', { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Failed to load /config.json: ${res.status} ${res.statusText}`)
  }
  cached = (await res.json()) as RuntimeConfig
  return cached
}

/** Test-only escape hatch so component tests don't need a network mock. */
export function __setRuntimeConfigForTests(config: RuntimeConfig | null): void {
  cached = config
}

/** Synchronous access for code that runs after boot (e.g. sign-out, which
 * needs the Cognito domain but can't await a fetch mid-redirect). Throws if
 * called before `loadRuntimeConfig` has resolved once. */
export function getCachedRuntimeConfigOrThrow(): RuntimeConfig {
  if (!cached) {
    throw new Error('Runtime config accessed before loadRuntimeConfig() resolved')
  }
  return cached
}
