"""
Sync song metadata from Bilibili API.

Usage:
    cd songs-server
    BILI_COOKIE="..." python -m scripts.sync_bili
"""

import asyncio
import os
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.models import Song

API_VIEW = "https://api.bilibili.com/x/web-interface/view"
API_DETAIL = "https://api.bilibili.com/x/web-interface/view/detail"
REQUEST_GAP = float(os.getenv("SONGS_SYNC_GAP_MS", "220")) / 1000

COVERS_DIR = Path(__file__).resolve().parent.parent.parent / "public" / "songs-covers"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)


async def fetch_meta(client: httpx.AsyncClient, bvid: str) -> dict | None:
    cookie = os.getenv("BILI_COOKIE", "")
    headers = {
        "accept": "application/json",
        "origin": "https://www.bilibili.com",
        "referer": f"https://www.bilibili.com/video/{bvid}/",
        "user-agent": UA,
    }
    if cookie:
        headers["cookie"] = cookie

    endpoints = [API_VIEW, API_DETAIL]

    for attempt in range(4):
        for ep in endpoints:
            try:
                await asyncio.sleep(REQUEST_GAP)
                r = await client.get(f"{ep}?bvid={bvid}", headers=headers)
                if r.status_code == 412 or r.status_code == 429:
                    continue

                data = r.json()
                code = data.get("code")
                if code != 0:
                    continue

                inner = data.get("data", {})
                title = inner.get("title") or inner.get("View", {}).get("title")
                pic = inner.get("pic") or inner.get("View", {}).get("pic")

                if title and pic:
                    if pic.startswith("http://"):
                        pic = f"https://{pic[7:]}"
                    return {"title": title, "cover": pic}

            except Exception:
                continue

        await asyncio.sleep(0.8 * (attempt + 1))

    return None


async def download_cover(client: httpx.AsyncClient, url: str, bvid: str) -> str | None:
    COVERS_DIR.mkdir(parents=True, exist_ok=True)

    for ext in ("jpg", "jpeg", "png", "webp", "gif", "avif"):
        if (COVERS_DIR / f"{bvid}.{ext}").exists():
            return f"/songs-covers/{bvid}.{ext}"

    try:
        r = await client.get(url, headers={"referer": "https://www.bilibili.com/", "user-agent": UA})
        r.raise_for_status()

        ct = r.headers.get("content-type", "").split(";")[0].strip()
        ext_map = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
        ext = ext_map.get(ct, "jpg")

        path = COVERS_DIR / f"{bvid}.{ext}"
        path.write_bytes(r.content)
        return f"/songs-covers/{bvid}.{ext}"
    except Exception:
        return None


async def main():
    db = SessionLocal()
    songs = db.query(Song).all()
    db.close()

    if not songs:
        print("No songs in database.")
        return

    updated = 0
    skipped = 0
    failed = 0

    async with httpx.AsyncClient(timeout=30) as client:
        for song in songs:
            bvid = song.bvid
            if not bvid:
                print(f"[skip] {song.id}: no bvid")
                skipped += 1
                continue

            print(f"[fetch] {song.id} ({bvid})...")
            meta = await fetch_meta(client, bvid)

            if not meta:
                print(f"[fail] {song.id}: API returned no data")
                failed += 1
                continue

            local_cover = await download_cover(client, meta["cover"], bvid)
            cover = local_cover or meta["cover"]

            db = SessionLocal()
            s = db.get(Song, song.id)
            if s:
                s.title = meta["title"]
                s.cover = cover
                s.bvid = bvid
                s.video_url = f"https://www.bilibili.com/video/{bvid}/"
                db.commit()
                print(f"[ok]   {song.id}: {meta['title']}")
                updated += 1
            db.close()

    print(f"Done. updated={updated}, skipped={skipped}, failed={failed}")


if __name__ == "__main__":
    asyncio.run(main())
