from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Song
from ..schemas import TagPayload, TagRemovePayload

router = APIRouter(prefix="/api/songs", tags=["tags"])


@router.post("/tag")
def add_tag(body: TagPayload, db: Session = Depends(get_db)):
    song = db.get(Song, body.song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    tag = body.tag.strip().lower()
    if not tag:
        raise HTTPException(status_code=400, detail="Tag cannot be empty")

    if tag in (t.lower() for t in song.tags):
        return {"song_id": body.song_id, "tag": tag, "added": False}

    song.tags = [*song.tags, tag]
    db.commit()
    return {"song_id": body.song_id, "tag": tag, "added": True}


@router.delete("/tag")
def remove_tag(body: TagRemovePayload, db: Session = Depends(get_db)):
    song = db.get(Song, body.song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    tag = body.tag.strip().lower()
    song.tags = [t for t in song.tags if t.lower() != tag]
    db.commit()
    return {"song_id": body.song_id, "tag": tag, "removed": True}
