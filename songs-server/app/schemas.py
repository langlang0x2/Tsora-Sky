from datetime import date, datetime

from pydantic import BaseModel, Field


class SongOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    title: str | None
    bvid: str | None
    video_url: str | None
    cover: str | None
    collect_date: date
    note: str | None = None
    tags: list[str] = []
    draft: bool = False


class SongListItem(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    title: str | None
    video_url: str | None
    cover: str | None
    collect_date: date
    note: str | None = None
    tags: list[str] = []


class TagPayload(BaseModel):
    song_id: str
    tag: str = Field(max_length=60)


class TagRemovePayload(BaseModel):
    song_id: str
    tag: str


class ClickBatchRead(BaseModel):
    ids: list[str]


class ClickIncrement(BaseModel):
    song_id: str


class ClickResponse(BaseModel):
    song_id: str
    plays: int
