import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const SONGS_DIR = path.join(ROOT, 'src', 'content', 'songs')
const PUBLIC_DIR = path.join(ROOT, 'public')
const COVERS_DIR = path.join(PUBLIC_DIR, 'songs-covers')
const API = 'https://api.bilibili.com/x/web-interface/view'
const API_DETAIL = 'https://api.bilibili.com/x/web-interface/view/detail'
const REQUEST_GAP_MS = Number(process.env.SONGS_SYNC_GAP_MS ?? 220)
let lastRequestAt = 0

const SHOULD_DOWNLOAD_COVERS = !['0', 'false', 'off'].includes(
  String(process.env.SONGS_SYNC_DOWNLOAD ?? '1').toLowerCase()
)

function getEol(text) {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

function escapeYamlSingleQuoted(str) {
  return String(str).replaceAll("'", "''")
}

function extractFrontmatter(text) {
  if (!text.startsWith('---')) return null
  const end = text.indexOf('\n---', 3)
  if (end === -1) return null

  const fm = text.slice(3, end + 1) // include trailing newline before ---
  const body = text.slice(end + '\n---'.length)
  const body2 = body.startsWith('\r\n') ? body.slice(2) : body.startsWith('\n') ? body.slice(1) : body
  return { fm, body: body2, fmStart: 0, fmEnd: end + '\n---'.length }
}

function findBvid({ fm, body }) {
  const direct = fm.match(/^bvid:\s*['"]?(BV[0-9A-Za-z]+)['"]?\s*$/m)
  if (direct?.[1]) return direct[1]

  const url = fm.match(/^videoUrl:\s*['"]?([^'"\n]+)['"]?\s*$/m)
  if (url?.[1]) {
    const m = url[1].match(/\/video\/(BV[0-9A-Za-z]+)(\/|$)/)
    if (m?.[1]) return m[1]
  }

  const inBody = body.match(/\bBV[0-9A-Za-z]+\b/)
  return inBody?.[0] ?? null
}

function upsertScalarLine(fm, key, rawValue) {
  const value = `'${escapeYamlSingleQuoted(rawValue)}'`
  const re = new RegExp(`^${key}:\\s*.*$`, 'm')
  if (re.test(fm)) return fm.replace(re, `${key}: ${value}`)

  const eol = getEol(fm)
  const lines = fm.split(/\r?\n/)
  lines.unshift(`${key}: ${value}`)
  return lines.join(eol)
}

function upsertVideoUrl(fm, bvid) {
  const url = `https://www.bilibili.com/video/${bvid}/`
  return upsertScalarLine(fm, 'videoUrl', url)
}

async function listSongFiles(dir) {
  const out = []
  const items = await fs.readdir(dir, { withFileTypes: true })
  for (const it of items) {
    const full = path.join(dir, it.name)
    if (it.isDirectory()) {
      out.push(...(await listSongFiles(full)))
      continue
    }
    if (!/\.(md|mdx)$/i.test(it.name)) continue
    if (it.name.startsWith('_')) continue
    out.push(full)
  }
  return out
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForRateLimit() {
  const now = Date.now()
  const diff = now - lastRequestAt
  if (diff < REQUEST_GAP_MS) {
    await sleep(REQUEST_GAP_MS - diff)
  }
  lastRequestAt = Date.now()
}

function buildBiliHeaders(bvid) {
  const headers = {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    origin: 'https://www.bilibili.com',
    referer: `https://www.bilibili.com/video/${bvid}/`,
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  }
  const cookie = String(process.env.BILI_COOKIE ?? '').trim()
  if (cookie) {
    headers.cookie = cookie
  }
  return headers
}

function extractMetaFromApiJson(json) {
  if (!json || typeof json !== 'object') return null
  const code = Number(json.code)
  if (!Number.isFinite(code)) return null
  if (code !== 0) return { errorCode: code }

  const title = json?.data?.title ?? json?.data?.View?.title
  const pic = json?.data?.pic ?? json?.data?.View?.pic
  if (!title || !pic) return null
  return { title, cover: pic }
}

async function fetchBiliMeta(bvid) {
  const endpoints = [API, API_DETAIL]
  let lastError = new Error('Unknown error')

  for (let attempt = 0; attempt < 4; attempt++) {
    for (const endpoint of endpoints) {
      try {
        await waitForRateLimit()
        const url = `${endpoint}?bvid=${encodeURIComponent(bvid)}`
        const res = await fetch(url, {
          headers: buildBiliHeaders(bvid)
        })

        if (!res.ok) {
          if (res.status === 412 || res.status === 429) {
            throw new Error(`HTTP ${res.status}`)
          }
          throw new Error(`HTTP ${res.status}`)
        }

        const json = await res.json()
        const parsed = extractMetaFromApiJson(json)
        if (parsed?.errorCode != null) {
          if (parsed.errorCode === -404) throw new Error('API code -404')
          throw new Error(`API code ${parsed.errorCode}`)
        }
        if (!parsed?.title || !parsed?.cover) {
          throw new Error('Missing title/cover')
        }

        let cover = parsed.cover
        if (typeof cover === 'string' && cover.startsWith('http://')) {
          cover = `https://${cover.slice('http://'.length)}`
        }
        return { title: parsed.title, cover }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
      }
    }

    const delay = 800 * (attempt + 1)
    await sleep(delay)
  }

  throw lastError
}

function extFromContentType(contentType) {
  const ct = String(contentType ?? '').toLowerCase().split(';')[0].trim()
  if (ct === 'image/jpeg') return 'jpg'
  if (ct === 'image/png') return 'png'
  if (ct === 'image/webp') return 'webp'
  if (ct === 'image/gif') return 'gif'
  if (ct === 'image/avif') return 'avif'
  return null
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function fileExists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function downloadCoverToPublic({ coverUrl, bvid }) {
  if (!SHOULD_DOWNLOAD_COVERS) return null
  if (!coverUrl || typeof coverUrl !== 'string') return null
  if (!coverUrl.startsWith('http')) return null

  await ensureDir(COVERS_DIR)

  const res = await fetch(coverUrl, {
    redirect: 'follow',
    headers: {
      'user-agent': 'Tsora-Sky sync script',
      referer: 'https://www.bilibili.com/'
    }
  })
  if (!res.ok) throw new Error(`Cover HTTP ${res.status}`)

  const ext =
    extFromContentType(res.headers.get('content-type')) ??
    path.extname(new URL(coverUrl).pathname).replace(/^\./, '') ??
    'jpg'

  const fileName = `${bvid}.${ext || 'jpg'}`
  const absPath = path.join(COVERS_DIR, fileName)
  const publicPath = `/songs-covers/${fileName}`

  if (await fileExists(absPath)) return publicPath

  const buf = Buffer.from(await res.arrayBuffer())
  await fs.writeFile(absPath, buf)
  return publicPath
}

async function main() {
  try {
    await fs.access(SONGS_DIR)
  } catch {
    console.error(`Songs dir not found: ${SONGS_DIR}`)
    process.exitCode = 1
    return
  }

  const files = await listSongFiles(SONGS_DIR)
  if (files.length === 0) {
    console.log('No song files found.')
    return
  }

  let updated = 0
  let skipped = 0
  let failed = 0

  for (const file of files) {
    const rel = path.relative(ROOT, file)
    const text = await fs.readFile(file, 'utf8')
    const parsed = extractFrontmatter(text)
    if (!parsed) {
      console.warn(`[skip] ${rel}: no frontmatter`) 
      skipped++
      continue
    }

    const bvid = findBvid({ fm: parsed.fm, body: parsed.body })
    if (!bvid) {
      console.log(`[skip] ${rel}: no BV id`) 
      skipped++
      continue
    }

    try {
      const meta = await fetchBiliMeta(bvid)
      const localCover = await downloadCoverToPublic({ coverUrl: meta.cover, bvid })
      let fm = parsed.fm
      fm = upsertScalarLine(fm, 'bvid', bvid)
      fm = upsertScalarLine(fm, 'title', meta.title)
      fm = upsertScalarLine(fm, 'cover', localCover ?? meta.cover)
      fm = upsertVideoUrl(fm, bvid)

      const eol = getEol(text)
      const out = `---${eol}${fm.replace(/\r?\n$/, '')}${eol}---${eol}${parsed.body}`
      if (out !== text) {
        await fs.writeFile(file, out, 'utf8')
        console.log(`[ok]   ${rel}: ${meta.title}`)
        updated++
      } else {
        console.log(`[noop] ${rel}`)
      }
    } catch (err) {
      console.warn(`[fail] ${rel}: ${String(err?.message ?? err)}`)
      failed++
    }
  }

  console.log(`Done. updated=${updated}, skipped=${skipped}, failed=${failed}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
