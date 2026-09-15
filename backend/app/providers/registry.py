"""
Provider registry - the single place that knows about every provider
class. `services/parking_service.py` and the /meta/providers endpoint go
through this instead of importing provider classes directly, so adding a
new source is a one-line change here.
"""
from __future__ import annotations

from app.config import get_settings
from app.providers.base import ParkingProvider
from app.providers.here_provider import HereProvider
from app.providers.osm_provider import OSMProvider
from app.providers.tomtom_provider import TomTomProvider


def get_all_providers() -> list[ParkingProvider]:
    settings = get_settings()
    return [
        OSMProvider(default_city=settings.default_city, default_country=settings.default_country),
        TomTomProvider(),
        HereProvider(),
    ]


def get_configured_providers() -> list[ParkingProvider]:
    return [p for p in get_all_providers() if p.is_configured()]
