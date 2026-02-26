import type { APIRoute } from 'astro'
import { kv } from '@vercel/kv'

export const prerender = false

const KV_HASH_KEY = 'songs:clicks:v1'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  })
}

export const GET: APIRoute = async ({ url }) => {
  const rawIds = url.searchParams.get('ids') ?? ''
  const ids = rawIds
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  if (ids.length === 0) {
    return json({})
  }

  const values = await kv.hmget(KV_HASH_KEY, ...ids)
  const out: Record<string, number> = {}
  for (let i = 0; i < ids.length; i++) {
    const val = Number(values?.[i] ?? 0)
    out[ids[i]] = Number.isFinite(val) ? val : 0
  }

  return json(out)
}

export const POST: APIRoute = async ({ request }) => {
  let body: { songId?: string }
  try {
    body = await request.json()
  } catch {
    return json({ message: 'Invalid JSON body' }, 400)
  }

  const songId = String(body.songId ?? '').trim()
  if (!songId) {
    return json({ message: 'songId is required' }, 400)
  }

  const nextValue = await kv.hincrby(KV_HASH_KEY, songId, 1)
  return json({ songId, plays: Number(nextValue ?? 0) })
}
