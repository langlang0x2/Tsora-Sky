from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Click
from ..schemas import ClickResponse, ClickBatchRead, ClickIncrement

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.post("/batch", response_model=dict[str, int])
def read_clicks(body: ClickBatchRead, db: Session = Depends(get_db)):
    ids = [i for i in body.ids if i]
    if not ids:
        return {}

    clicks = db.query(Click).filter(Click.song_id.in_(ids)).all()
    result = {c.song_id: c.count for c in clicks}
    for id_ in ids:
        if id_ not in result:
            result[id_] = 0
    return result


@router.post("/incr", response_model=ClickResponse)
def incr_click(body: ClickIncrement, db: Session = Depends(get_db)):
    click = db.get(Click, body.song_id)
    if not click:
        click = Click(song_id=body.song_id, count=1)
        db.add(click)
    else:
        click.count += 1
    db.commit()
    db.refresh(click)
    return ClickResponse(song_id=click.song_id, plays=click.count)
