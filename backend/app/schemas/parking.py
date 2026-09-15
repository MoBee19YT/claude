"""
Pydantic (API) schemas.

Output is GeoJSON (a Feature/FeatureCollection per RFC 7946) because that's
what MapLibre GL JS consumes natively. Extra fields on the FeatureCollection
(`meta`) are allowed as "foreign members" under the GeoJSON spec.

Every optional field is genuinely optional: `None` means "the connected
data source doesn't tell us this", and the frontend is responsible for
rendering that as "Information unavailable" rather than a guessed value.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field

ParkingType = Literal["lot", "garage", "street", "space", "unknown"]
AccessType = Literal["public", "private", "customers", "permit", "residents", "no", "unknown"]
AvailabilityType = Literal["realtime", "predicted", "static", "unknown"]


class ParkingProperties(BaseModel):
    id: UUID
    sources: list[str]
    source_ids: dict[str, str] = Field(default_factory=dict)

    parking_type: ParkingType
    access: Optional[AccessType] = None

    fee: Optional[bool] = Field(None, description="true=paid, false=free, null=unavailable")
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
    availability_type: AvailabilityType = "unknown"
    availability_updated: Optional[datetime] = None
    confidence: Optional[float] = None

    name: Optional[str] = None
    address: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None

    last_updated: Optional[datetime] = None

    # Computed at request time, not stored.
    is_open_now: Optional[bool] = Field(None, description="null if opening_hours is unknown/unparseable")
    distance_m: Optional[float] = Field(None, description="distance from the query point, if one was given")

    model_config = {"from_attributes": True}


class ParkingFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: dict[str, Any]
    properties: ParkingProperties


class ParkingFeatureMeta(BaseModel):
    count: int
    attribution: str = "© OpenStreetMap contributors"
    providers_active: list[str] = Field(default_factory=list)
    providers_available_not_configured: list[str] = Field(default_factory=list)
    truncated: bool = False


class ParkingFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[ParkingFeature]
    meta: ParkingFeatureMeta


class FindParkingResult(BaseModel):
    feature: ParkingFeature
    score: float
    rank: int
    best_match: bool
    reasons: list[str]


class FindParkingResponse(BaseModel):
    results: list[FindParkingResult]
    meta: ParkingFeatureMeta


class SearchResult(BaseModel):
    label: str
    address: Optional[str] = None
    latitude: float
    longitude: float
    type: Optional[str] = None
    bbox: Optional[tuple[float, float, float, float]] = None


class ProviderStatus(BaseModel):
    name: str
    configured: bool
    description: str


class ProvidersMeta(BaseModel):
    providers: list[ProviderStatus]
