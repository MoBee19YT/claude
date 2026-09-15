"""
Bulk-import OpenStreetMap parking data for a region into PostGIS.

Usage (run from the backend/ directory, with the venv/deps installed and
DATABASE_URL pointing at a running PostGIS instance):

    python -m scripts.import_osm
        # imports DEFAULT_BBOX from .env (Prague by default)

    python -m scripts.import_osm --bbox 14.30,50.02,14.48,50.13 --city Prague --country "Czech Republic"
        # imports an explicit bounding box - use this to expand to a new
        # city/region without touching any code

This fetches every amenity=parking / parking_space / parking:lane
feature in the bbox from the Overpass API (one request - fine for a
city-sized area; for a country-sized area, run this once per city/region
instead of one giant bbox, to stay within Overpass's usage limits), then
upserts the normalized results into PostGIS.

Safe to re-run: upserts are keyed by (primary_source, primary_source_id),
so re-importing the same bbox updates existing rows instead of
duplicating them.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.dialects.postgresql import insert as pg_insert  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.models.parking import ImportCell  # noqa: E402
from app.providers.osm_provider import OSMProvider  # noqa: E402
from app.services.merge_service import merge_and_dedupe  # noqa: E402
from app.services.parking_service import (  # noqa: E402
    CACHE_SOURCE_LABEL,
    GRID_SIZE_DEG,
    cells_for_bbox,
    upsert_records,
)


async def import_bbox(min_lon: float, min_lat: float, max_lon: float, max_lat: float, city: str, country: str) -> None:
    provider = OSMProvider(default_city=city, default_country=country)
    print(f"Fetching OSM parking data for bbox ({min_lon}, {min_lat}, {max_lon}, {max_lat}) from Overpass ...")
    records = await provider.fetch_bbox(min_lon, min_lat, max_lon, max_lat)
    print(f"Overpass returned {len(records)} raw elements. Merging/deduping ...")
    merged = merge_and_dedupe(records)
    print(f"{len(merged)} parking facilities after merge. Writing to PostGIS ...")

    async with AsyncSessionLocal() as db:
        count = await upsert_records(db, merged)

        cells = cells_for_bbox(min_lon, min_lat, max_lon, max_lat)
        for cell_x, cell_y in cells:
            await db.execute(
                pg_insert(ImportCell)
                .values(
                    cell_x=cell_x,
                    cell_y=cell_y,
                    source=CACHE_SOURCE_LABEL,
                    grid_size=GRID_SIZE_DEG,
                    feature_count=0,
                )
                .on_conflict_do_nothing()
            )
        await db.commit()

    print(f"Done. Upserted {count} parking facilities and cached {len(cells)} grid cells.")


def main() -> None:
    settings = get_settings()
    default_bbox = settings.default_bbox_tuple

    parser = argparse.ArgumentParser(description="Import OpenStreetMap parking data into PostGIS")
    parser.add_argument("--bbox", type=str, default=None, help="min_lon,min_lat,max_lon,max_lat")
    parser.add_argument("--city", type=str, default=settings.default_city)
    parser.add_argument("--country", type=str, default=settings.default_country)
    args = parser.parse_args()

    if args.bbox:
        try:
            min_lon, min_lat, max_lon, max_lat = (float(x) for x in args.bbox.split(","))
        except ValueError:
            parser.error("--bbox must be 'min_lon,min_lat,max_lon,max_lat'")
            return
    else:
        min_lon, min_lat, max_lon, max_lat = default_bbox

    asyncio.run(import_bbox(min_lon, min_lat, max_lon, max_lat, args.city, args.country))


if __name__ == "__main__":
    main()
