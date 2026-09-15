"""
A small, deliberately limited evaluator for OSM's `opening_hours` syntax
(https://wiki.openstreetmap.org/wiki/Key:opening_hours).

The full spec is a mini-language with holidays, sun-relative times, and
many edge cases. Rather than depend on a heavyweight/complex parser, this
module supports the common subset ("24/7", "Mo-Fr 08:00-18:00",
"Mo-Fr 08:00-18:00; Sa 08:00-12:00", "Mo-Su 00:00-24:00", "off" segments)
and returns `None` - "unknown" - for anything else. Returning `None`
instead of a wrong guess is the whole point: the API/UI must show
"Hours unavailable" rather than a confidently wrong open/closed state.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

_DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
_DAY_RE = re.compile(r"^(Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))?$")
_TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$")


def _expand_days(token: str) -> Optional[list[str]]:
    days: list[str] = []
    for part in token.split(","):
        part = part.strip()
        m = _DAY_RE.match(part)
        if not m:
            return None
        start = m.group(1)
        end = m.group(3)
        if not end:
            days.append(start)
            continue
        i, j = _DAYS.index(start), _DAYS.index(end)
        days.extend(_DAYS[i : j + 1] if i <= j else _DAYS[i:] + _DAYS[: j + 1])
    return days


def _time_covers(token: str, minutes_now: int) -> Optional[bool]:
    if token == "off" or token == "closed":
        return False
    covered = False
    any_range = False
    for part in token.split(","):
        part = part.strip()
        if part in ("off", "closed"):
            continue
        m = _TIME_RE.match(part)
        if not m:
            return None
        h1, m1, h2, m2 = (int(x) for x in m.groups())
        start = h1 * 60 + m1
        end = h2 * 60 + m2
        any_range = True
        if end <= start:  # overnight range, e.g. 22:00-02:00
            if minutes_now >= start or minutes_now < end:
                covered = True
        elif start <= minutes_now < end:
            covered = True
    return covered if any_range else None


def is_open_now(opening_hours: Optional[str], now: Optional[datetime] = None) -> Optional[bool]:
    if not opening_hours:
        return None
    value = opening_hours.strip()
    if value in ("24/7",):
        return True

    now = now or datetime.now()
    current_day = _DAYS[now.weekday()]
    minutes_now = now.hour * 60 + now.minute

    result: Optional[bool] = None
    for rule in value.split(";"):
        rule = rule.strip()
        if not rule:
            continue
        tokens = rule.split(" ", 1)
        day_token = tokens[0]
        time_token = tokens[1].strip() if len(tokens) > 1 else "off"

        days = _expand_days(day_token)
        if days is None:
            return None  # unsupported syntax - don't guess
        if current_day not in days:
            continue

        covered = _time_covers(time_token, minutes_now)
        if covered is None:
            return None
        result = covered  # later matching rules override earlier ones, per spec

    return result
