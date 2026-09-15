"""
TomTom provider.

Uses TomTom's Search API (POI Search) - https://developer.tomtom.com/search-api/documentation/search-service/points-of-interest-search
Get a free-tier key at https://developer.tomtom.com/, then set
TOMTOM_API_KEY in backend/.env. Until a key is set, `is_configured()`
returns False and this provider is skipped entirely (no error, no fake
data) - see providers/registry.py.

IMPORTANT / honesty note: the public Search API only tells us a parking
facility exists (name, location, address). It does NOT include live
pricing or availability - that lives behind TomTom's separate, more
restricted "Parking Availability" product which most developer accounts
don't have access to. So this provider intentionally leaves
fee/price/availability as None (unknown) rather than guessing. If you
later get access to that product, add the call in `fetch_bbox` and set
those fields - the rest of the app (model, merge, ranking, UI) already
knows how to handle real availability data.
"""
from __future__ import annotations

from typing import Any, Optional

import httpx

from app.config import get_settings
from app.providers.base import NormalizedParking, ParkingProvider

SEARCH_URL = "https://api.tomtom.com/search/2/poiSearch/parking.json"


class TomTomProvider(ParkingProvider):
    name = "tomtom"

    def __init__(self):
        self.settings = get_settings()

    def is_configured(self) -> bool:
        return bool(self.settings.tomtom_api_key)

    def description(self) -> str:
        return "TomTom Search API (POI locations). Requires TOMTOM_API_KEY."

    async def fetch_bbox(
        self, min_lon: float, min_lat: float, max_lon: float, max_lat: float
    ) -> list[NormalizedParking]:
        if not self.is_configured():
            return []

        params = {
            "key": self.settings.tomtom_api_key,
            "topLeft": f"{max_lat},{min_lon}",
            "btmRight": f"{min_lat},{max_lon}",
            "limit": 100,
        }
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(SEARCH_URL, params=params)
            response.raise_for_status()
            payload = response.json()

        results: list[NormalizedParking] = []
        for item in payload.get("results", []):
            normalized = self._normalize(item)
            if normalized:
                results.append(normalized)
        return results

    @staticmethod
    def _normalize(item: dict[str, Any]) -> Optional[NormalizedParking]:
        position = item.get("position")
        if not position:
            return None
        poi_id = item.get("id")
        if not poi_id:
            return None

        poi = item.get("poi", {})
        address = item.get("address", {})
        classifications = [c.get("code", "") for c in poi.get("classifications", [])]
        parking_type = "garage" if any("GARAGE" in c.upper() for c in classifications) else "lot"

        return NormalizedParking(
            source="tomtom",
            source_id=str(poi_id),
            geometry={"type": "Point", "coordinates": [position["lon"], position["lat"]]},
            parking_type=parking_type,
            access="unknown",
            fee=None,
            price=None,
            currency=None,
            name=poi.get("name"),
            address=address.get("freeformAddress"),
            country=address.get("country"),
            city=address.get("municipality"),
            availability_type="unknown",
            confidence=0.5,
            raw_tags=item,
        )
