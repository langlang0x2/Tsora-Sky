import type { APIRoute } from 'astro'
import { Redis } from '@upstash/redis'

export const prerender = false

const KV_HASH_KEY = 'songs:clicks:v1'

function createRedisClient() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    throw new Error(
      'Redis is not configured. Missing KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN.'
    )
  }
  return new Redis({ url, token })
}

function hasKvEnv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  return Boolean(url && token)
}

function ensureKvEnv() {
  if (!hasKvEnv()) {
    throw new Error('Vercel KV is not configured. Missing KV_REST_API_URL or KV_REST_API_TOKEN.')
  }
}

async function readPlays(ids: string[]) {
  ensureKvEnv()
  const redis = createRedisClient()

  const values = await redis.hmget(KV_HASH_KEY, ...ids)
  const out: Record<string, number> = {}
  for (let i = 0; i < ids.length; i++) {
    const val = Number(values?.[i] ?? 0)
    out[ids[i]] = Number.isFinite(val) ? val : 0
  }
  return out
}

async function increasePlay(songId: string) {
  ensureKvEnv()
  const redis = createRedisClient()

  const nextValue = await redis.hincrby(KV_HASH_KEY, songId, 1)
  return Number(nextValue ?? 0)
}

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
  try {
    const rawIds = url.searchParams.get('ids') ?? ''
    const ids = rawIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)

    if (ids.length === 0) {
      return json({})
    }

    const out = await readPlays(ids)
    return json(out)
  } catch (err) {
    const msg = String((err as Error)?.message ?? err)
    const status = /not configured/i.test(msg) ? 503 : 500
    return json({ message: `Read stats failed: ${msg}` }, status)
  }
}

export const POST: APIRoute = async ({ request }) => {
  let body: { songId?: string; ids?: string[] }
  try {
    body = await request.json()
  } catch {
    return json({ message: 'Invalid JSON body' }, 400)
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.map((id) => String(id ?? '').trim()).filter(Boolean)
    : []

  if (ids.length > 0) {
    try {
      const out = await readPlays(ids)
      return json(out)
    } catch (err) {
      const msg = String((err as Error)?.message ?? err)
      const status = /not configured/i.test(msg) ? 503 : 500
      return json({ message: `Read stats failed: ${msg}` }, status)
    }
  }

  const songId = String(body.songId ?? '').trim()
  if (!songId) {
    return json({ message: 'songId is required (or provide ids[])' }, 400)
  }

  try {
    const nextValue = await increasePlay(songId)
    return json({ songId, plays: Number(nextValue ?? 0) })
  } catch (err) {
    const msg = String((err as Error)?.message ?? err)
    const status = /not configured/i.test(msg) ? 503 : 500
    return json({ message: `Increase stats failed: ${msg}` }, status)
  }
}
