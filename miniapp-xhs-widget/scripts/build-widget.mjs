import { mkdir, cp, rm, writeFile, readFile } from 'node:fs/promises'
import { build } from '../../miniapp/node_modules/esbuild/lib/main.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
await rm(dist, { recursive: true, force: true })
await mkdir(path.join(dist, 'pages/index'), { recursive: true })

await build({
  entryPoints: [path.join(root, 'src/pages/index/index.ts')],
  outfile: path.join(dist, 'pages/index/index.js'),
  bundle: true,
  minify: true,
  platform: 'neutral',
  // Upload compilation targets iOS 10 and rewrites async, spread, and
  // optional chaining into require("@babel/runtime/..."). The phone has no require.
  target: 'es2016',
  format: 'iife',
  logLevel: 'warning',
})

for (const file of ['app.js', 'app.json', 'app.css', 'project.config.json', 'pages/index/index.xhsml', 'pages/index/index.css', 'pages/index/index.json']) {
  const target = path.join(dist, file)
  await mkdir(path.dirname(target), { recursive: true })
  await cp(path.join(root, file), target)
}

const config = JSON.parse(await readFile(path.join(dist, 'project.config.json'), 'utf8'))
config.miniprogramRoot = './'
config.projectname = 'perler-pattern-xhs-widget'
await writeFile(path.join(dist, 'project.config.json'), `${JSON.stringify(config, null, 2)}\n`)

console.log(`Built XHS widget: ${dist}`)
