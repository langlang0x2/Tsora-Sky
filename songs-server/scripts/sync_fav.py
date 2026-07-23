"""
Sync songs from Bilibili favorite folder(s) into SQLite.

Usage:
    cd songs-server
    BILI_COOKIE="..." python -m scripts.sync_fav
"""

import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal, engine
from app.models import Base, Song

# Your favorite folder IDs
FOLDER_IDS = [
    2701926928,
    # add more here
]

API = "https://api.bilibili.com/x/v3/fav/resource/list"
REQUEST_GAP = float(os.getenv("SONGS_SYNC_GAP_MS", "300")) / 1000

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)


async def fetch_page(client: httpx.AsyncClient, media_id: int, page: int, cookie: str) -> list[dict]:
    headers = {
        "accept": "application/json",
        "origin": "https://www.bilibili.com",
        "referer": f"https://space.bilibili.com/433511928/favlist?fid={media_id}",
        "user-agent": UA,
    }
    if cookie:
        headers["cookie"] = cookie

    await asyncio.sleep(REQUEST_GAP)
    r = await client.get(f"{API}?media_id={media_id}&pn={page}&ps=20", headers=headers)
    r.raise_for_status()

    data = r.json()
    if data.get("code") != 0:
        raise RuntimeError(f"API error: code={data.get('code')}, message={data.get('message')}")

    medias = data.get("data", {}).get("medias", [])
    if not medias:
        return []

    results = []
    for m in medias:
        bvid = m.get("bvid")
        if not bvid:
            continue
        collect_ts = m.get("fav_time") or m.get("attr") or 0
        collect_date = datetime.fromtimestamp(int(collect_ts)).date() if collect_ts else None
        results.append({
            "bvid": bvid,
            "title": m.get("title", ""),
            "cover": m.get("cover", ""),
            "collect_date": collect_date,
        })
    return results


def process_cover(cover: str, bvid: str) -> str:
    """Store cover locally, return public path. Falls back to remote URL."""
    if not cover or not cover.startswith("http"):
        return cover

    covers_dir = Path(__file__).resolve().parent.parent.parent / "public" / "songs-covers"
    covers_dir.mkdir(parents=True, exist_ok=True)

    for ext in ("jpg", "jpeg", "png", "webp"):
        candidate = covers_dir / f"{bvid}.{ext}"
        if candidate.exists():
            return f"/songs-covers/{bvid}.{ext}"

    try:
        r = httpx.get(cover, headers={"referer": "https://www.bilibili.com/", "user-agent": UA}, timeout=15)
        r.raise_for_status()
        ct = r.headers.get("content-type", "").split(";")[0].strip()
        ext_map = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
        ext = ext_map.get(ct, "jpg")
        path = covers_dir / f"{bvid}.{ext}"
        path.write_bytes(r.content)
        return f"/songs-covers/{bvid}.{ext}"
    except Exception:
        return cover


async def main():
    cookie = os.getenv("BILI_COOKIE", "")
    if not cookie:
        print("Warning: BILI_COOKIE not set. API may return empty or rate-limited results.")

    Base.metadata.create_all(bind=engine)

    async with httpx.AsyncClient(timeout=30) as client:
        for media_id in FOLDER_IDS:
            print(f"\n── Syncing folder {media_id} ──")
            page = 1
            total_added = 0
            total_updated = 0

            while True:
                try:
                    items = await fetch_page(client, media_id, page, cookie)
                except Exception as e:
                    print(f"  [error] page {page}: {e}")
                    break

                if not items:
                    print(f"  page {page}: empty, done.")
                    break

                db = SessionLocal()
                for item in items:
                    bvid = item["bvid"]
                    existing = db.get(Song, bvid)

                    if existing:
                        if not existing.cover or existing.cover.startswith("http"):
                            existing.cover = process_cover(item["cover"], bvid)
                        if not existing.title or existing.title.startswith("BV"):
                            existing.title = item["title"]
                        total_updated += 1
                    else:
                        cover = process_cover(item["cover"], bvid)
                        song = Song(
                            id=bvid,
                            title=item["title"],
                            bvid=bvid,
                            video_url=f"https://www.bilibili.com/video/{bvid}/",
                            cover=cover,
                            collect_date=item["collect_date"],
                            tags=[],
                        )
                        db.add(song)
                        total_added += 1

                db.commit()
                db.close()
                print(f"  page {page}: {len(items)} items")
                page += 1

            print(f"  folder {media_id} done: added={total_added}, updated={total_updated}")


if __name__ == "__main__":
    asyncio.run(main())
