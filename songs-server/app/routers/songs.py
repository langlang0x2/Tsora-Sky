from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Song
from ..schemas import SongListItem, SongOut

router = APIRouter(prefix="/api/songs", tags=["songs"])

# ── /tags must be before /{song_id} to avoid route conflict ──

@router.get("/tags", response_model=list[str])
def list_tags(db: Session = Depends(get_db)):
    rows = db.execute(
        select(Song.tags).where(Song.draft == False)
    ).scalars().all()

    tag_set: set[str] = set()
    for tags in rows:
        if tags:
            tag_set.update(t.lower() for t in tags)

    return sorted(tag_set)


@router.get("/all", response_model=list[SongListItem])
def list_all_songs(db: Session = Depends(get_db)):
    stmt = select(Song).where(Song.draft == False).order_by(Song.collect_date.desc())
    return db.execute(stmt).scalars().all()


@router.get("", response_model=list[SongListItem])
def list_songs(
    tag: str | None = Query(None),
    search: str | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(24, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    stmt = select(Song).where(Song.draft == False).order_by(Song.collect_date.desc())

    if tag:
        stmt = stmt.where(Song.tags.contains(tag.lower()))

    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            (Song.title.ilike(pattern))
            | (Song.note.ilike(pattern))
        )

    songs = db.execute(stmt.offset(offset).limit(limit)).scalars().all()
    return songs


@router.get("/{song_id}", response_model=SongOut)
def get_song(song_id: str, db: Session = Depends(get_db)):
    song = db.get(Song, song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    return song
