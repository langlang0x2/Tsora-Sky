"""
Import songs from CSV into SQLite.

CSV headers: bv, collect_hour, title
collect_hour format: yy-MM-dd-HH

Usage:
    cd songs-server
    python -m scripts.import_csv input.csv [--overwrite]
"""

import csv
import re
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import engine, SessionLocal
from app.models import Base, Song


def parse_collect_hour(raw: str) -> date:
    m = re.match(r"^(\d{2})-(\d{2})-(\d{2})-(\d{2})$", raw.strip())
    if not m:
        raise ValueError(f"Invalid collect_hour: {raw}")

    yy, mm, dd, hh = int(m[1]), int(m[2]), int(m[3]), int(m[4])
    full_year = 2000 + yy

    if not (1 <= mm <= 12 and 1 <= dd <= 31 and 0 <= hh <= 23):
        raise ValueError(f"Invalid date values in: {raw}")

    dt = datetime(full_year, mm, dd, hh, 0, 0)
    return dt.date()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    overwrite = "--overwrite" in sys.argv

    if not args:
        print("Usage: python -m scripts.import_csv <input.csv> [--overwrite]")
        sys.exit(1)

    csv_path = Path(args[0])
    if not csv_path.exists():
        print(f"CSV file not found: {csv_path}")
        sys.exit(1)

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        created = 0
        skipped = 0

        for row in reader:
            bv = row["bv"].strip()
            if not re.match(r"^BV[0-9A-Za-z]+$", bv):
                print(f"[skip] invalid BV: {bv}")
                skipped += 1
                continue

            existing = db.get(Song, bv)
            if existing and not overwrite:
                skipped += 1
                continue

            collect_date = parse_collect_hour(row["collect_hour"])
            title = row["title"].strip()

            if existing:
                existing.title = title
                existing.collect_date = collect_date
                existing.video_url = f"https://www.bilibili.com/video/{bv}/"
            else:
                song = Song(
                    id=bv,
                    title=title,
                    bvid=bv,
                    video_url=f"https://www.bilibili.com/video/{bv}/",
                    collect_date=collect_date,
                )
                db.add(song)
            created += 1

    db.commit()
    db.close()
    print(f"Done. created={created}, skipped={skipped}")


if __name__ == "__main__":
    main()
