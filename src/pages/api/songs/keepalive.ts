import type { APIRoute } from 'astro'
import { Redis } from '@upstash/redis'

export const prerender = false

function getRedisRestEnv() {
  const url =
    process.env.STORAGE_KV_REST_API_URL ??
    process.env.STORAGE_UPSTASH_REDIS_REST_URL ??
    process.env.KV_REST_API_URL ??
    process.env.UPSTASH_REDIS_REST_URL

  const token =
    process.env.STORAGE_KV_REST_API_TOKEN ??
    process.env.STORAGE_UPSTASH_REDIS_REST_TOKEN ??
    process.env.KV_REST_API_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN

  return { url, token }
}

function createRedisClient() {
  const { url, token } = getRedisRestEnv()
  if (!url || !token) {
    throw new Error(
      'KV is not configured. Missing STORAGE_KV_REST_API_URL/STORAGE_KV_REST_API_TOKEN (or STORAGE_UPSTASH_REDIS_REST_URL/STORAGE_UPSTASH_REDIS_REST_TOKEN).'
    )
  }
  return new Redis({ url, token })
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

export const GET: APIRoute = async () => {
  try {
    const redis = createRedisClient()

    // 轻量写入 + TTL：确保不会无限增长，也能产生“活跃访问”。
    const key = 'kv:keepalive:v1'
    const now = Date.now()
    await redis.set(key, String(now), { ex: 60 * 60 * 24 * 7 })

    return json({ ok: true, key, ts: now })
  } catch (err) {
    const msg = String((err as Error)?.message ?? err)
    const status = /not configured/i.test(msg) ? 503 : 500
    return json({ ok: false, message: `Keepalive failed: ${msg}` }, status)
  }
}
