"""
One-time migration: parse all song markdown files into SQLite.

Usage:
    cd songs-server
    python -m scripts.migrate
"""

import os
import re
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import engine, SessionLocal
from app.models import Base, Song


def parse_tag_value(raw: str) -> str:
    text = raw.strip()
    if not text:
        return ""
    if text.startswith("'") and text.endswith("'"):
        return text[1:-1].replace("''", "'")
    if text.startswith('"') and text.endswith('"'):
        return text[1:-1]
    return text


def parse_frontmatter(text: str) -> dict | None:
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    if end == -1:
        return None
    fm = text[3:end]

    data: dict = {"tags": []}
    current_key: str | None = None

    for line in fm.splitlines():
        if line.startswith("  - "):
            if current_key == "tags":
                val = parse_tag_value(line[4:])
                if val:
                    data["tags"].append(val.lower())
            continue

        m = re.match(r"^(\w+):\s*(.*)$", line)
        if not m:
            continue

        key = m.group(1).strip()
        val = m.group(2).strip().strip("'\"")

        if key == "tags":
            current_key = "tags"
            continue
        elif key == "collectDate":
            data["collect_date"] = date.fromisoformat(val[:10])
        elif key == "bvid":
            data["bvid"] = val
        elif key == "title":
            data["title"] = val
        elif key == "videoUrl":
            data["video_url"] = val
        elif key == "cover":
            data["cover"] = val
        elif key == "note":
            data["note"] = val
        elif key == "draft":
            data["draft"] = val.lower() in ("true", "yes", "1")

        current_key = None

    return data if "collect_date" in data else None


def main():
    songs_dir = Path(__file__).resolve().parent.parent.parent / "src" / "content" / "songs"

    if not songs_dir.exists():
        print(f"Songs directory not found: {songs_dir}")
        sys.exit(1)

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    files = sorted(songs_dir.glob("*.md"))
    created = 0
    skipped = 0

    for f in files:
        if f.name.startswith("_"):
            continue

        song_id = f.stem
        text = f.read_text("utf-8")
        data = parse_frontmatter(text)

        if not data:
            print(f"[skip]  {f.name}: no valid frontmatter")
            skipped += 1
            continue

        existing = db.get(Song, song_id)
        if existing:
            skipped += 1
            continue

        song = Song(
            id=song_id,
            title=data.get("title"),
            bvid=data.get("bvid"),
            video_url=data.get("video_url"),
            cover=data.get("cover"),
            collect_date=data["collect_date"],
            note=data.get("note"),
            tags=data.get("tags", []),
            draft=data.get("draft", False),
        )
        db.add(song)
        created += 1

    db.commit()
    db.close()
    print(f"Done. created={created}, skipped={skipped}")


if __name__ == "__main__":
    main()
