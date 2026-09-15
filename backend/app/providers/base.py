"""
Provider interface.

Every parking data source (OpenStreetMap today; TomTom/HERE/municipal
feeds later) implements `ParkingProvider` and returns a list of
`NormalizedParking` objects using the *same* shared shape. This is what
lets the rest of the app (storage, merging, ranking, the API) stay
completely ignorant of where a given parking record came from.

Add a new source by writing one new provider class - no other code needs
to change (see registry.py).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional


@dataclass
class NormalizedParking:
    """The common parking model every provider must normalize into.

    `geometry` is a GeoJSON-style geometry dict, e.g.
    {"type": "Point", "coordinates": [lon, lat]} or a Polygon/LineString.
    Fields left as None mean "this source doesn't tell us" - callers must
    never fill them in with a guess.
    """

    source: str
    source_id: str
    geometry: dict[str, Any]

    # Populated by services/merge_service.py when two providers' records
    # get merged into one. A freshly-normalized record from a single
    # provider just has one entry (set in __post_init__).
    sources: list[str] = field(default_factory=list)
    source_ids: dict[str, str] = field(default_factory=dict)

    parking_type: str = "unknown"  # lot | garage | street | space | unknown
    access: Optional[str] = None  # public | private | customers | permit | residents

    fee: Optional[bool] = None
    price: Optional[float] = None
    price_period: Optional[str] = None
    currency: Optional[str] = None

    capacity: Optional[int] = None
    capacity_disabled: Optional[int] = None

    opening_hours: Optional[str] = None
    max_stay: Optional[str] = None

    resident_only: Optional[bool] = None
    ev: Optional[bool] = None
    accessible: Optional[bool] = None
    covered: Optional[bool] = None

    availability_count: Optional[int] = None
    availability_type: str = "unknown"  # realtime | predicted | static | unknown
    availability_updated: Optional[datetime] = None
    confidence: float = 0.5

    name: Optional[str] = None
    address: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None

    raw_tags: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.sources:
            self.sources = [self.source]
        if not self.source_ids:
            self.source_ids = {self.source: self.source_id}


class ParkingProvider(ABC):
    """Base class for a parking data source."""

    name: str = "base"

    @abstractmethod
    def is_configured(self) -> bool:
        """Whether this provider has everything it needs (e.g. an API key)
        to actually be queried. Providers that need no credentials (OSM)
        are always configured."""
        raise NotImplementedError

    @abstractmethod
    async def fetch_bbox(
        self, min_lon: float, min_lat: float, max_lon: float, max_lat: float
    ) -> list[NormalizedParking]:
        """Return parking facilities intersecting the given bounding box."""
        raise NotImplementedError

    def description(self) -> str:
        return ""
