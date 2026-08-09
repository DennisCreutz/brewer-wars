import { build } from 'esbuild'
import { mkdirSync, readdirSync } from 'node:fs'

const handlers = readdirSync('src/handlers').map((f) => f.replace(/\.ts$/, ''))

mkdirSync('dist', { recursive: true })

for (const handler of handlers) {
  await build({
    entryPoints: [`src/handlers/${handler}.ts`],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    outfile: `dist/${handler}/index.mjs`,
    external: ['@aws-sdk/*'],
    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
  })
}

console.log(`Built ${handlers.length} handlers: ${handlers.join(', ')}`)
