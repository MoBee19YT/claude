"""
OpenStreetMap provider.

Queries the Overpass API (https://overpass-api.de) for raw OSM elements
tagged as parking and normalizes them into `NormalizedParking` objects.

Tags handled (see https://wiki.openstreetmap.org/wiki/Key:amenity=parking
and https://wiki.openstreetmap.org/wiki/Key:parking:lane):
  - amenity=parking            -> a lot or garage (refined by parking=*)
  - amenity=parking_space      -> an individual space
  - parking:lane:{left,right,both}     -> on-street parking segments
  - parking:condition:{left,right,both} -> access/fee for on-street segments

Every field is derived from an explicit tag. If OSM doesn't say, the
field is left as None - we never guess. The one deliberate exception is
`covered`, which is inferred from a structural tag (parking=underground /
multi-storey implies an enclosed structure) unless an explicit
covered=yes/no tag overrides it; that's documented at the call site.
"""
from __future__ import annotations

import re
from typing import Any, Optional

import httpx
from shapely.geometry import LineString, Polygon

from app.config import get_settings
from app.providers.base import NormalizedParking, ParkingProvider

# Overpass is asked to give up server-side at this many seconds, and the HTTP
# client waits only slightly longer. Kept modest because these fetches run as
# background cache warming - a slow one should be abandoned and retried later,
# not left holding a worker.
OVERPASS_TIMEOUT = 25


def build_overpass_query(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> str:
    bbox = f"{min_lat},{min_lon},{max_lat},{max_lon}"  # Overpass wants south,west,north,east
    return f"""
[out:json][timeout:{OVERPASS_TIMEOUT}];
(
  nwr["amenity"="parking"]({bbox});
  nwr["amenity"="parking_space"]({bbox});
  way["parking:lane:both"]({bbox});
  way["parking:lane:left"]({bbox});
  way["parking:lane:right"]({bbox});
  way["parking:both"]({bbox});
  way["parking:left"]({bbox});
  way["parking:right"]({bbox});
);
out body geom;
""".strip()


_CHARGE_RE = re.compile(
    r"(?P<amount>\d+(?:[.,]\d+)?)\s*(?P<currency>[A-Za-z]{3}|Kč|€|\$|£)?\s*(?:/\s*(?P<period>\d*\s*[A-Za-z]+))?"
)

_CURRENCY_SYMBOLS = {"Kč": "CZK", "€": "EUR", "$": "USD", "£": "GBP"}


def parse_charge(value: str) -> tuple[Optional[float], Optional[str], Optional[str]]:
    """Best-effort parse of an OSM `charge`/`fee:conditional` value like
    "20 CZK/hour" or "1 EUR/20 minutes". Returns (amount, currency, period).
    Falls back to (None, None, None) if it can't confidently parse it -
    the raw string stays available in raw_tags so nothing is lost."""
    if not value:
        return None, None, None
    match = _CHARGE_RE.search(value)
    if not match:
        return None, None, None
    amount_str = match.group("amount")
    currency = match.group("currency")
    period = match.group("period")
    try:
        amount = float(amount_str.replace(",", "."))
    except ValueError:
        return None, None, None
    if currency:
        currency = _CURRENCY_SYMBOLS.get(currency, currency.upper())
    if period:
        period = period.strip().lower()
    return amount, currency, period


def _to_int(value: Any) -> Optional[int]:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _way_geometry(geom_nodes: list[dict]) -> Optional[dict]:
    coords = [[n["lon"], n["lat"]] for n in geom_nodes if "lon" in n and "lat" in n]
    if len(coords) < 2:
        return None
    is_closed = coords[0] == coords[-1] and len(coords) >= 4
    if is_closed:
        try:
            if not Polygon(coords).is_valid:
                return {"type": "LineString", "coordinates": coords}
        except Exception:
            return {"type": "LineString", "coordinates": coords}
        return {"type": "Polygon", "coordinates": [coords]}
    return {"type": "LineString", "coordinates": coords}


def _relation_geometry(members: list[dict]) -> Optional[dict]:
    """Best-effort: union the outer ways of a multipolygon relation. Falls
    back to a centroid Point if the geometry can't be assembled cleanly -
    real-world OSM relations are messy and we'd rather show an approximate
    location than crash the import."""
    lines = []
    for member in members:
        if member.get("type") != "way" or "geometry" not in member:
            continue
        coords = [[n["lon"], n["lat"]] for n in member["geometry"] if "lon" in n and "lat" in n]
        if len(coords) >= 2:
            lines.append(coords)
    if not lines:
        return None
    try:
        from shapely.ops import polygonize, unary_union

        merged = unary_union([LineString(c) for c in lines])
        polygons = list(polygonize(merged))
        if polygons:
            poly = max(polygons, key=lambda p: p.area) if len(polygons) > 1 else polygons[0]
            return {"type": "Polygon", "coordinates": [list(poly.exterior.coords)]}
    except Exception:
        pass
    # Fallback: centroid of every coordinate we saw.
    all_coords = [c for line in lines for c in line]
    if not all_coords:
        return None
    lon = sum(c[0] for c in all_coords) / len(all_coords)
    lat = sum(c[1] for c in all_coords) / len(all_coords)
    return {"type": "Point", "coordinates": [lon, lat]}


def _parse_amenity_parking(tags: dict[str, str], element_type: str) -> dict[str, Any]:
    parking_kind = tags.get("parking", "surface")
    if element_type == "parking_space" or tags.get("amenity") == "parking_space":
        parking_type = "space"
    elif parking_kind in ("multi-storey", "underground", "rooftop"):
        parking_type = "garage"
    else:
        parking_type = "lot"

    access_tag = tags.get("access")
    access = access_tag if access_tag in ("public", "private", "customers", "permit", "residents") else (
        "unknown" if access_tag is None else access_tag
    )

    fee_tag = tags.get("fee")
    fee = {"yes": True, "no": False}.get(fee_tag)

    price, currency, period = (None, None, None)
    charge = tags.get("charge") or tags.get("fee:conditional")
    if charge:
        price, currency, period = parse_charge(charge)

    covered = None
    covered_tag = tags.get("covered")
    if covered_tag in ("yes", "no"):
        covered = covered_tag == "yes"
    elif parking_kind in ("underground", "multi-storey"):
        covered = True  # documented inference, see module docstring
    elif parking_kind == "surface":
        covered = False

    wheelchair = tags.get("wheelchair")
    accessible = {"yes": True, "limited": True, "no": False}.get(wheelchair)
    if accessible is None and _to_int(tags.get("capacity:disabled")):
        accessible = True

    ev = None
    if any("charging" in k for k in tags) or tags.get("amenity") == "charging_station":
        ev = True

    resident_only = None
    if access_tag in ("residents", "permit"):
        resident_only = True
    elif access_tag in ("public", "yes", "customers", "private"):
        resident_only = False

    return {
        "parking_type": parking_type,
        "access": access,
        "fee": fee,
        "price": price,
        "currency": currency,
        "price_period": period,
        "capacity": _to_int(tags.get("capacity")),
        "capacity_disabled": _to_int(tags.get("capacity:disabled")),
        "opening_hours": tags.get("opening_hours"),
        "max_stay": tags.get("maxstay"),
        "resident_only": resident_only,
        "ev": ev,
        "accessible": accessible,
        "covered": covered,
        "name": tags.get("name"),
    }


_CONDITION_ACCESS = {
    "free": ("unknown", False),
    "ticket": ("unknown", True),
    "disc": ("unknown", False),
    "residents": ("residents", None),
    "customers": ("customers", None),
    "private": ("private", None),
    "no_parking": ("no", None),
    "no_stopping": ("no", None),
}


def _parse_street_parking(tags: dict[str, str]) -> Optional[dict[str, Any]]:
    condition = (
        tags.get("parking:condition:both")
        or tags.get("parking:condition:left")
        or tags.get("parking:condition:right")
    )
    lane = (
        tags.get("parking:lane:both")
        or tags.get("parking:lane:left")
        or tags.get("parking:lane:right")
        or tags.get("parking:both")
        or tags.get("parking:left")
        or tags.get("parking:right")
    )
    if not lane and not condition:
        return None
    if lane == "no":
        return None

    access, fee = _CONDITION_ACCESS.get(condition or "", ("unknown", None))
    return {
        "parking_type": "street",
        "access": access,
        "fee": fee,
        "price": None,
        "currency": None,
        "price_period": None,
        "capacity": None,
        "capacity_disabled": None,
        "opening_hours": tags.get("opening_hours"),
        "max_stay": tags.get("maxstay"),
        "resident_only": access == "residents",
        "ev": None,
        "accessible": None,
        "covered": False,
        "name": tags.get("name"),
    }


_NO_PARKING_LANE_VALUES = {"no", "none", "separate"}


def street_side_from_tags(tags: dict[str, str]) -> Optional[str]:
    """Which side(s) of the road an on-street segment allows parking on.

    Derived from the stored OSM tags rather than a dedicated column, so the
    map can draw parking bays on the correct side of the street without a
    schema change. Returns "left", "right", "both" or None if unknown.
    Sides are relative to the direction of the way, which is also how
    MapLibre's line-offset works.
    """
    if not tags:
        return None

    def has(*keys: str) -> bool:
        return any(tags.get(k) and tags[k] not in _NO_PARKING_LANE_VALUES for k in keys)

    if has("parking:lane:both", "parking:both"):
        return "both"
    left = has("parking:lane:left", "parking:left")
    right = has("parking:lane:right", "parking:right")
    if left and right:
        return "both"
    if left:
        return "left"
    if right:
        return "right"
    return None


def normalize_element(element: dict, default_city: str, default_country: str) -> Optional[NormalizedParking]:
    tags = element.get("tags", {}) or {}
    el_type = element.get("type")

    geometry: Optional[dict] = None
    if el_type == "node":
        if "lat" not in element or "lon" not in element:
            return None
        if tags.get("amenity") not in ("parking", "parking_space"):
            return None
        geometry = {"type": "Point", "coordinates": [element["lon"], element["lat"]]}
        parsed = _parse_amenity_parking(tags, "parking_space" if tags.get("amenity") == "parking_space" else "parking")
    elif el_type == "way":
        geometry = _way_geometry(element.get("geometry", []))
        if geometry is None:
            return None
        if tags.get("amenity") in ("parking", "parking_space"):
            parsed = _parse_amenity_parking(tags, tags.get("amenity"))
        else:
            parsed = _parse_street_parking(tags)
            if parsed is None:
                return None
    elif el_type == "relation":
        geometry = _relation_geometry(element.get("members", []))
        if geometry is None:
            return None
        parsed = _parse_amenity_parking(tags, "parking")
    else:
        return None

    address = None
    if tags.get("addr:street"):
        address = tags.get("addr:street")
        if tags.get("addr:housenumber"):
            address = f"{address} {tags['addr:housenumber']}"

    return NormalizedParking(
        source="openstreetmap",
        source_id=f"{el_type}/{element['id']}",
        geometry=geometry,
        parking_type=parsed["parking_type"],
        access=parsed["access"],
        fee=parsed["fee"],
        price=parsed["price"],
        price_period=parsed["price_period"],
        currency=parsed["currency"],
        capacity=parsed["capacity"],
        capacity_disabled=parsed["capacity_disabled"],
        opening_hours=parsed["opening_hours"],
        max_stay=parsed["max_stay"],
        resident_only=parsed["resident_only"],
        ev=parsed["ev"],
        accessible=parsed["accessible"],
        covered=parsed["covered"],
        availability_count=None,
        availability_type="unknown",
        availability_updated=None,
        confidence=0.7,
        name=parsed["name"],
        address=address,
        country=tags.get("addr:country", default_country),
        city=tags.get("addr:city", default_city),
        raw_tags=tags,
    )


class OSMProvider(ParkingProvider):
    name = "openstreetmap"

    def __init__(self, default_city: str = "", default_country: str = ""):
        self.settings = get_settings()
        self.default_city = default_city
        self.default_country = default_country

    def is_configured(self) -> bool:
        return True  # Overpass needs no API key

    def description(self) -> str:
        return "OpenStreetMap parking data via the Overpass API. Free, no key required."

    async def fetch_bbox(
        self, min_lon: float, min_lat: float, max_lon: float, max_lat: float
    ) -> list[NormalizedParking]:
        query = build_overpass_query(min_lon, min_lat, max_lon, max_lat)
        async with httpx.AsyncClient(timeout=OVERPASS_TIMEOUT) as client:
            response = await client.post(self.settings.overpass_url, data={"data": query})
            response.raise_for_status()
            payload = response.json()

        results: list[NormalizedParking] = []
        for element in payload.get("elements", []):
            try:
                normalized = normalize_element(element, self.default_city, self.default_country)
            except Exception:
                # One malformed OSM element should never fail the whole batch.
                normalized = None
            if normalized:
                results.append(normalized)
        return results
