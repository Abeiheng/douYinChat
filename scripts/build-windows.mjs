import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
// Deliberately unsigned: never pick up unrelated certificates from the host.
const env = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
for (const name of [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'WIN_CSC_LINK',
  'WIN_CSC_KEY_PASSWORD',
  'CSC_NAME',
  'CSC_KEYCHAIN'
])
  delete env[name]

// Invoke Node entry files directly: works on Windows without shell quoting or .cmd wrappers.
const commands = [
  ['typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.node.json', '--composite', 'false'],
  ['vue-tsc/bin/vue-tsc.js', '--noEmit', '-p', 'tsconfig.web.json', '--composite', 'false'],
  ['electron-vite/bin/electron-vite.js', 'build'],
  ['electron-builder/cli.js', '--win', 'nsis', '--x64', '--publish', 'never']
]
for (const [entry, ...args] of commands) {
  const result = spawnSync(process.execPath, [join(root, 'node_modules', entry), ...args], {
    cwd: root,
    env,
    stdio: 'inherit'
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
