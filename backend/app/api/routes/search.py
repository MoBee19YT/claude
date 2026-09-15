from fastapi import APIRouter, HTTPException, Query

from app.schemas.parking import SearchResult
from app.services.geocoding_service import search_places

router = APIRouter(tags=["search"])


@router.get("/search", response_model=list[SearchResult])
async def search(q: str = Query(..., min_length=1, description="Free-text address/place query")):
    try:
        return await search_places(q)
    except Exception as exc:  # noqa: BLE001 - surface a clean 502 instead of a stack trace
        raise HTTPException(status_code=502, detail=f"Search provider unavailable: {exc}") from exc
