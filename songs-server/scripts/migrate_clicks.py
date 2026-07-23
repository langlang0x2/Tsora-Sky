"""
Migrate play counts from Upstash Redis to local SQLite.

Env vars needed (same as current Astro setup):
  UPSTASH_REDIS_REST_URL  (or STORAGE_KV_REST_API_URL / KV_REST_API_URL)
  UPSTASH_REDIS_REST_TOKEN (or STORAGE_KV_REST_API_TOKEN / KV_REST_API_TOKEN)

Usage:
    cd songs-server
    UPSTASH_REDIS_REST_URL="https://xxx.upstash.io" UPSTASH_REDIS_REST_TOKEN="xxx" python -m scripts.migrate_clicks
"""

import os
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal, engine
from app.models import Base, Click

KV_HASH_KEY = "songs:clicks:v1"


def get_redis_env():
    url = (
        os.getenv("UPSTASH_REDIS_REST_URL")
        or os.getenv("STORAGE_KV_REST_API_URL")
        or os.getenv("STORAGE_UPSTASH_REDIS_REST_URL")
        or os.getenv("KV_REST_API_URL")
    )
    token = (
        os.getenv("UPSTASH_REDIS_REST_TOKEN")
        or os.getenv("STORAGE_KV_REST_API_TOKEN")
        or os.getenv("STORAGE_UPSTASH_REDIS_REST_TOKEN")
        or os.getenv("KV_REST_API_TOKEN")
    )
    return url, token


def main():
    url, token = get_redis_env()
    if not url or not token:
        print("Missing Upstash Redis env vars.")
        print("Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN")
        sys.exit(1)

    # Upstash REST API: GET /hgetall/{key}
    api_url = f"{url.rstrip('/')}/hgetall/{KV_HASH_KEY}"
    headers = {"Authorization": f"Bearer {token}"}

    print(f"Fetching play counts from Upstash...")
    res = httpx.get(api_url, headers=headers, timeout=30)
    res.raise_for_status()

    data = res.json()
    # Upstash REST returns HGETALL as a flat JSON array: [field1, val1, field2, val2, ...]
    # or as an object: {"field1": "val1", "field2": "val2"}
    result = data.get("result", data) if isinstance(data, dict) else data

    if isinstance(result, list):
        # Convert flat array to dict
        entries = {}
        for i in range(0, len(result), 2):
            if i + 1 < len(result):
                entries[result[i]] = int(result[i + 1])
    elif isinstance(result, dict):
        entries = {k: int(v) for k, v in result.items() if v is not None}
    else:
        print(f"Unexpected response format: {type(result)}")
        sys.exit(1)

    print(f"Found {len(entries)} click records in Redis.")

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    inserted = 0
    updated = 0

    for song_id, count in entries.items():
        click = db.get(Click, song_id)
        if click:
            click.count = max(click.count, count)
            updated += 1
        else:
            db.add(Click(song_id=song_id, count=count))
            inserted += 1

    db.commit()
    db.close()

    print(f"Done. inserted={inserted}, updated={updated}, total={len(entries)}")


if __name__ == "__main__":
    main()
