import type { APIRoute } from 'astro'
import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const prerender = false

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  })
}

function normalizeTag(tag: unknown) {
  return String(tag ?? '').trim()
}

function parseTagValue(raw: string) {
  const text = raw.trim()
  if (!text) return ''
  if (text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'")
  }
  if (text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1)
  }
  return text
}

function toYamlTagLine(tag: string) {
  const escaped = tag.replace(/'/g, "''")
  return `  - '${escaped}'`
}

function isSafeSongId(songId: string) {
  return !songId.includes('..') && !path.isAbsolute(songId)
}

async function findSongFilePath(songId: string) {
  const songsRoot = path.resolve(process.cwd(), 'src', 'content', 'songs')
  const normalizedId = songId.replace(/\\/g, '/').replace(/^\/+/, '')

  const candidates = new Set<string>()
  if (/\.(md|mdx)$/i.test(normalizedId)) {
    candidates.add(normalizedId)
  } else {
    candidates.add(`${normalizedId}.md`)
    candidates.add(`${normalizedId}.mdx`)
  }

  for (const rel of candidates) {
    const abs = path.resolve(songsRoot, rel)
    if (!(abs === songsRoot || abs.startsWith(`${songsRoot}${path.sep}`))) continue

    try {
      await access(abs)
      return abs
    } catch {
      // continue
    }
  }

  throw new Error('Song source file not found')
}

function addTagToFrontmatter(raw: string, tag: string) {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const lines = raw.split(/\r?\n/)
  const sepIndexes: number[] = []

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      sepIndexes.push(index)
      if (sepIndexes.length === 2) break
    }
  }

  if (sepIndexes.length < 2) {
    throw new Error('Invalid frontmatter')
  }

  const fmStart = sepIndexes[0]
  const fmEnd = sepIndexes[1]
  let tagsLineIndex = -1
  for (let index = fmStart + 1; index < fmEnd; index += 1) {
    if (/^tags:\s*$/.test(lines[index])) {
      tagsLineIndex = index
      break
    }
  }

  const normalizedNew = tag.toLowerCase()

  if (tagsLineIndex >= 0) {
    let cursor = tagsLineIndex + 1
    const existed = new Set<string>()

    while (cursor < fmEnd) {
      const matched = lines[cursor].match(/^\s*-\s+(.+)\s*$/)
      if (!matched) break
      existed.add(parseTagValue(matched[1]).toLowerCase())
      cursor += 1
    }

    if (existed.has(normalizedNew)) {
      return { changed: false, content: raw }
    }

    lines.splice(cursor, 0, toYamlTagLine(tag))
    return { changed: true, content: lines.join(eol) }
  }

  lines.splice(fmEnd, 0, 'tags:', toYamlTagLine(tag))
  return { changed: true, content: lines.join(eol) }
}

export const POST: APIRoute = async ({ request }) => {
  let body: { songId?: string; tag?: string }
  try {
    body = await request.json()
  } catch {
    return json({ message: 'Invalid JSON body' }, 400)
  }

  const songId = String(body.songId ?? '').trim()
  const tag = normalizeTag(body.tag)

  if (!songId) return json({ message: 'songId is required' }, 400)
  if (!isSafeSongId(songId)) return json({ message: 'Invalid songId' }, 400)
  if (!tag) return json({ message: 'tag is required' }, 400)
  if (tag.length > 60) return json({ message: 'tag is too long' }, 400)

  try {
    const filePath = await findSongFilePath(songId)
    const raw = await readFile(filePath, 'utf8')
    const next = addTagToFrontmatter(raw, tag)

    if (next.changed) {
      await writeFile(filePath, next.content, 'utf8')
    }

    return json({ songId, tag, added: next.changed })
  } catch (err) {
    const msg = String((err as Error)?.message ?? err)
    const status = /not found/i.test(msg) ? 404 : 500
    return json({ message: `Add tag failed: ${msg}` }, status)
  }
}
