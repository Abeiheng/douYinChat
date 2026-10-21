import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { zipSync } from 'fflate'

const root = fileURLToPath(new URL('../', import.meta.url))
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const manifest = JSON.parse(await readFile(join(root, 'extension/manifest.json'), 'utf8'))
const expectedTag = `v${pkg.version}`
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== expectedTag) {
  throw new Error(`标签必须与 package.json 一致：${expectedTag}`)
}
const output = join(root, 'dist/release')
await mkdir(output, { recursive: true })
// Only exact release files are copied; logs and unpacked app directories stay local.
const installer = `${pkg.name}-${pkg.version}-windows-x64-setup.exe`
await copyFile(join(root, 'dist', installer), join(output, installer))
const zip = {}
for (const name of [
  'manifest.json',
  'background.js',
  'content.js',
  'popup.html',
  'popup.css',
  'popup.js'
]) {
  zip[`extension/${name}`] = new Uint8Array(await readFile(join(root, 'extension', name)))
}
zip['安装说明.txt'] = new TextEncoder().encode(
  '解压到固定目录。在 Chrome 打开 chrome://extensions，开启开发者模式，点击“加载已解压的扩展程序”，选择 extension 文件夹。\r\n' +
    '在桌面软件设置中复制配对码，粘贴到扩展；打开并登录抖音直播间，连接当前直播页，再在桌面开始接收。\r\n' +
    '不要删除或移动已加载的文件夹。升级后重新加载扩展并刷新直播页。\r\n'
)
await writeFile(join(output, `douyin-extension-${manifest.version}.zip`), zipSync(zip))
await copyFile(join(root, 'docs/WINDOWS.md'), join(output, 'WINDOWS.md'))
// Ignore old release versions if this directory has been used before.
const names = [installer, `douyin-extension-${manifest.version}.zip`, 'WINDOWS.md'].sort()
const sums = []
for (const name of names) {
  const data = await readFile(join(output, name))
  sums.push(`${createHash('sha256').update(data).digest('hex')}  ${name}`)
}
await writeFile(join(output, 'SHA256SUMS.txt'), sums.join('\n') + '\n')
const unexpected = (await readdir(output)).filter(
  (name) => ![...names, 'SHA256SUMS.txt'].includes(name)
)
if (unexpected.length)
  throw new Error('dist/release 中含有旧产物，请清空该目录后重新运行 release:assets')
console.log(`发布文件已生成：${output}`)
