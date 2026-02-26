import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const SONGS_DIR = path.join(ROOT, 'src', 'content', 'songs')

function printHelp() {
  console.log(`Usage:\n  node preset/scripts/parseSongsCsv.mjs <input.csv> [summary.json] [--overwrite]\n\nCSV headers required:\n  bv,collect_hour,title\n\ncollect_hour format:\n  yy-MM-dd-HH (example: 26-02-14-14)\n\nOutput:\n  Create markdown files in src/content/songs as <BV>.md\n  Existing files are skipped by default; use --overwrite to replace.`)
}

function parseArgs(argv) {
  const args = argv.slice(2)
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    return { help: true }
  }

  const overwrite = args.includes('--overwrite')
  const positional = args.filter((arg) => arg !== '--overwrite')

  return {
    help: false,
    inputPath: positional[0],
    outputPath: positional[1] ?? null,
    overwrite
  }
}

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      const next = line[i + 1]
      if (inQuotes && next === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (ch === ',' && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }

    current += ch
  }

  cells.push(current)
  return cells.map((s) => s.trim())
}

function parseCollectHour(raw) {
  const m = /^\s*(\d{2})-(\d{2})-(\d{2})-(\d{2})\s*$/.exec(String(raw ?? ''))
  if (!m) {
    throw new Error(`Invalid collect_hour format: ${raw}`)
  }

  const yy = Number(m[1])
  const mm = Number(m[2])
  const dd = Number(m[3])
  const hh = Number(m[4])

  if (mm < 1 || mm > 12) throw new Error(`Invalid month in collect_hour: ${raw}`)
  if (dd < 1 || dd > 31) throw new Error(`Invalid day in collect_hour: ${raw}`)
  if (hh < 0 || hh > 23) throw new Error(`Invalid hour in collect_hour: ${raw}`)

  const fullYear = 2000 + yy
  const dt = new Date(fullYear, mm - 1, dd, hh, 0, 0, 0)

  if (
    dt.getFullYear() !== fullYear ||
    dt.getMonth() !== mm - 1 ||
    dt.getDate() !== dd ||
    dt.getHours() !== hh
  ) {
    throw new Error(`Invalid date in collect_hour: ${raw}`)
  }

  return {
    year: fullYear,
    month: mm,
    day: dd,
    hour: hh,
    iso: dt.toISOString(),
    dateOnly: dt.toISOString().slice(0, 10)
  }
}

function toSongMarkdown({ bv, title, collectDate }) {
  const safeTitle = String(title).replaceAll("'", "''")
  return `---\ntitle: '${safeTitle}'\nbvid: '${bv}'\nvideoUrl: 'https://www.bilibili.com/video/${bv}/'\ncollectDate: ${collectDate}\n---\n`
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function main() {
  const { help, inputPath, outputPath, overwrite } = parseArgs(process.argv)
  if (help) {
    printHelp()
    return
  }

  await ensureDir(SONGS_DIR)

  const absInput = path.resolve(process.cwd(), inputPath)
  const text = await fs.readFile(absInput, 'utf8')

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length < 2) {
    throw new Error('CSV has no data rows.')
  }

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
  const required = ['bv', 'collect_hour', 'title']
  const missing = required.filter((k) => !header.includes(k))
  if (missing.length > 0) {
    throw new Error(`Missing required headers: ${missing.join(', ')}`)
  }

  const idx = {
    bv: header.indexOf('bv'),
    collectHour: header.indexOf('collect_hour'),
    title: header.indexOf('title')
  }

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    if (cols.length === 1 && cols[0] === '') continue

    const bv = String(cols[idx.bv] ?? '').trim()
    const collectHourRaw = String(cols[idx.collectHour] ?? '').trim()
    const title = String(cols[idx.title] ?? '').trim()

    if (!bv || !collectHourRaw || !title) {
      throw new Error(`Row ${i + 1} has empty required fields.`)
    }
    if (!/^BV[0-9A-Za-z]+$/.test(bv)) {
      throw new Error(`Row ${i + 1} has invalid BV: ${bv}`)
    }

    const parsedTime = parseCollectHour(collectHourRaw)
    rows.push({
      bv,
      title,
      collect_hour: collectHourRaw,
      collect_date: parsedTime.dateOnly,
      collect_iso: parsedTime.iso
    })
  }

  let created = 0
  let skipped = 0
  const createdFiles = []

  for (const row of rows) {
    const outFile = path.join(SONGS_DIR, `${row.bv}.md`)
    const hasFile = await exists(outFile)
    if (hasFile && !overwrite) {
      skipped++
      continue
    }

    const content = toSongMarkdown({
      bv: row.bv,
      title: row.title,
      collectDate: row.collect_date
    })
    await fs.writeFile(outFile, content, 'utf8')
    created++
    createdFiles.push(path.relative(ROOT, outFile))
  }

  if (outputPath) {
    const absOutput = path.resolve(process.cwd(), outputPath)
    await fs.writeFile(
      absOutput,
      `${JSON.stringify({ total: rows.length, created, skipped, files: createdFiles }, null, 2)}\n`,
      'utf8'
    )
  }

  console.log(`Parsed rows: ${rows.length}`)
  console.log(`Created files: ${created}`)
  console.log(`Skipped files: ${skipped}${overwrite ? ' (overwrite enabled)' : ''}`)
  if (createdFiles.length > 0) {
    for (const file of createdFiles) {
      console.log(`- ${file}`)
    }
  }
}

main().catch((err) => {
  console.error(err?.message ?? String(err))
  process.exitCode = 1
})
