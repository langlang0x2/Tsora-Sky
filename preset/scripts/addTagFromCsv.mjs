import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const SONGS_DIR = path.join(ROOT, 'src', 'content', 'songs')

function printHelp() {
  console.log(`Usage:\n  node preset/scripts/addTagFromCsv.mjs <input.csv> [tag]\n\nExamples:\n  node preset/scripts/addTagFromCsv.mjs "C:\\Users\\you\\Downloads\\fav.csv"\n  node preset/scripts/addTagFromCsv.mjs "./fav.csv" 日语\n\nNotes:\n  - Extract all BV ids from csv content (e.g. BV11xxxx)\n  - Find matching markdown files in src/content/songs\n  - Append tag into frontmatter tags list if not exists`)
}

function parseArgs(argv) {
  const args = argv.slice(2)
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    return { help: true }
  }

  return {
    help: false,
    inputPath: args[0],
    tag: String(args[1] ?? '日语').trim() || '日语'
  }
}

function getEol(text) {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

function parseTagValue(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return ''
  if (text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'")
  }
  if (text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1)
  }
  return text
}

function toYamlTagLine(tag) {
  const escaped = String(tag).replaceAll("'", "''")
  return `  - '${escaped}'`
}

function addTagToFrontmatter(raw, tag) {
  const eol = getEol(raw)
  const lines = raw.split(/\r?\n/)
  const sep = []

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      sep.push(i)
      if (sep.length === 2) break
    }
  }

  if (sep.length < 2) {
    throw new Error('No valid frontmatter found')
  }

  const fmStart = sep[0]
  const fmEnd = sep[1]
  let tagsIdx = -1
  for (let i = fmStart + 1; i < fmEnd; i += 1) {
    if (/^tags:\s*$/.test(lines[i])) {
      tagsIdx = i
      break
    }
  }

  const normalized = String(tag).toLowerCase()

  if (tagsIdx >= 0) {
    let insertIdx = tagsIdx + 1
    const existed = new Set()

    while (insertIdx < fmEnd) {
      const m = lines[insertIdx].match(/^\s*-\s+(.+)\s*$/)
      if (!m) break
      existed.add(parseTagValue(m[1]).toLowerCase())
      insertIdx += 1
    }

    if (existed.has(normalized)) {
      return { changed: false, content: raw }
    }

    lines.splice(insertIdx, 0, toYamlTagLine(tag))
    return { changed: true, content: lines.join(eol) }
  }

  lines.splice(fmEnd, 0, 'tags:', toYamlTagLine(tag))
  return { changed: true, content: lines.join(eol) }
}

async function listSongFiles(dir) {
  const out = []
  const items = await fs.readdir(dir, { withFileTypes: true })
  for (const item of items) {
    const full = path.join(dir, item.name)
    if (item.isDirectory()) {
      out.push(...(await listSongFiles(full)))
      continue
    }

    if (!/\.(md|mdx)$/i.test(item.name)) continue
    if (item.name.startsWith('_')) continue
    out.push(full)
  }
  return out
}

function extractBvSetFromCsv(text) {
  const matches = String(text).match(/BV[0-9A-Za-z]+/g) ?? []
  return new Set(matches.map((x) => x.trim()))
}

async function main() {
  const { help, inputPath, tag } = parseArgs(process.argv)
  if (help) {
    printHelp()
    return
  }

  const absCsv = path.resolve(ROOT, inputPath)
  const csvText = await fs.readFile(absCsv, 'utf8')
  const bvSet = extractBvSetFromCsv(csvText)

  if (bvSet.size === 0) {
    throw new Error('No BV ids found in csv')
  }

  const files = await listSongFiles(SONGS_DIR)
  const fileMap = new Map()
  for (const file of files) {
    const base = path.basename(file).replace(/\.(md|mdx)$/i, '')
    if (/^BV[0-9A-Za-z]+$/.test(base)) {
      fileMap.set(base, file)
    }
  }

  let updated = 0
  let unchanged = 0
  let missing = 0

  for (const bv of [...bvSet].sort((a, b) => a.localeCompare(b))) {
    const file = fileMap.get(bv)
    if (!file) {
      missing += 1
      console.log(`[missing] ${bv}`)
      continue
    }

    const raw = await fs.readFile(file, 'utf8')
    const next = addTagToFrontmatter(raw, tag)
    if (!next.changed) {
      unchanged += 1
      continue
    }

    await fs.writeFile(file, next.content, 'utf8')
    updated += 1
    console.log(`[updated] ${path.relative(ROOT, file)}`)
  }

  console.log('---')
  console.log(`BV total in csv: ${bvSet.size}`)
  console.log(`Updated files: ${updated}`)
  console.log(`Unchanged files: ${unchanged}`)
  console.log(`Missing files: ${missing}`)
}

main().catch((err) => {
  console.error(err?.message ?? String(err))
  process.exitCode = 1
})
