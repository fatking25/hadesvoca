import { readdir, writeFile } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'

const publicDir = 'public'
const outputPath = join(publicDir, 'content-precache.json')
const roots = ['content', 'audio']
const allowedExtensions = new Set(['.json', '.jpg', '.jpeg', '.png', '.svg', '.wav', '.mp3', '.webp'])

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath))
      continue
    }
    if (!entry.isFile()) continue
    if (!allowedExtensions.has(extname(entry.name).toLowerCase())) continue
    const webPath = `/${relative(publicDir, fullPath).split(sep).join('/')}`
    files.push(webPath)
  }
  return files
}

const urls = []
for (const root of roots) {
  urls.push(...await collectFiles(join(publicDir, root)))
}

urls.sort()

await writeFile(
  outputPath,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), urls }, null, 2)}\n`,
  'utf8',
)

console.log(`Generated ${outputPath} with ${urls.length} urls.`)
