"""
Scores and ranks candidate parking facilities for the "Find Parking"
feature.

The score is a weighted blend of distance, price, availability and
restrictions - each weight only kicks in when we actually have that
piece of information; unknown values get a neutral (not punishing)
score rather than being treated as bad. `reasons` lists only the facts
we actually know, in the same style as the UI mock in the product spec
("350m away", "Paid", "Open now") - nothing is invented for a reason
we can't back up with real data.
"""
from __future__ import annotations

from app.models.parking import Parking
from app.schemas.parking import FindParkingResult
from app.services.geo_utils import haversine_m, row_centroid_lonlat
from app.services.opening_hours import is_open_now
from app.services.serialization import row_to_feature

_WEIGHT_DISTANCE = 0.40
_WEIGHT_PRICE = 0.25
_WEIGHT_AVAILABILITY = 0.20
_WEIGHT_OPEN = 0.15


def _distance_score(distance_m: float, max_walk_m: float) -> float:
    return max(0.0, 1 - distance_m / max_walk_m)


def _price_score(row: Parking) -> float:
    if row.fee is False:
        return 1.0
    if row.price is not None:
        return max(0.0, 1 - min(float(row.price), 100.0) / 100.0)
    return 0.5  # unknown price - neutral, not punished


def _availability_score(row: Parking) -> float:
    if row.availability_type in ("realtime", "predicted"):
        if row.availability_count is not None and row.capacity:
            return max(0.0, min(1.0, row.availability_count / row.capacity))
        return 0.7
    return 0.4  # unknown - neutral-low, since "known good" should rank above it


def _restriction_penalty(row: Parking) -> float:
    penalty = 0.0
    if row.access == "no":
        penalty += 1.0
    if row.access == "private":
        penalty += 0.6
    if row.resident_only:
        penalty += 0.4
    if is_open_now(row.opening_hours) is False:
        penalty += 0.3
    return penalty


def _reasons(row: Parking, distance_m: float | None) -> list[str]:
    reasons: list[str] = []
    if distance_m is not None:
        reasons.append(f"{int(round(distance_m))} m away")
    if row.fee is False:
        reasons.append("Free parking")
    elif row.fee is True:
        reasons.append("Paid parking")

    open_state = is_open_now(row.opening_hours)
    if open_state is True:
        reasons.append("Open now")
    elif open_state is False:
        reasons.append("Closed now")

    if row.availability_type in ("realtime", "predicted") and row.availability_count is not None:
        reasons.append(f"{row.availability_count} spaces available")
    elif row.availability_type == "predicted":
        reasons.append("Predicted availability")

    if row.resident_only:
        reasons.append("Residents only")
    if row.access == "private":
        reasons.append("Private")
    if row.ev:
        reasons.append("EV charging available")
    if row.accessible:
        reasons.append("Accessible parking")
    return reasons


def rank_candidates(
    rows: list[Parking], ref_point: tuple[float, float], max_walk_m: float = 1000.0
) -> list[FindParkingResult]:
    scored: list[tuple[float, Parking, float]] = []
    for row in rows:
        lon, lat = row_centroid_lonlat(row.centroid)
        distance_m = haversine_m(ref_point[0], ref_point[1], lon, lat)

        score = (
            _WEIGHT_DISTANCE * _distance_score(distance_m, max_walk_m)
            + _WEIGHT_PRICE * _price_score(row)
            + _WEIGHT_AVAILABILITY * _availability_score(row)
            + _WEIGHT_OPEN * (0.0 if is_open_now(row.opening_hours) is False else 1.0)
        )
        score = max(0.0, score - _restriction_penalty(row))
        scored.append((score, row, distance_m))

    scored.sort(key=lambda t: t[0], reverse=True)

    results: list[FindParkingResult] = []
    for rank, (score, row, distance_m) in enumerate(scored):
        feature = row_to_feature(row, ref_point=ref_point)
        results.append(
            FindParkingResult(
                feature=feature,
                score=round(score, 3),
                rank=rank,
                best_match=(rank == 0),
                reasons=_reasons(row, distance_m),
            )
        )
    return results
