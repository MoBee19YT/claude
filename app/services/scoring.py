"""Side-by-side comparison and the verdict shown on comparison pages.

Each category lists its "aspects" (e.g. Performance · Price · Value). An
aspect is either a spec key, "price" (lowest offer, lower is better) or
"value" (a spec's score per €100, higher is better).
"""
from ..models import Product
from ..schemas import AspectResult, CompareCell, CompareResult, CompareRow
from .products import format_spec, lowest_price, product_summary


def _best(values: dict[str, float | None], better: str | None) -> set[str]:
    """Slugs holding the best value; empty when it can't be ranked or everyone ties."""
    numeric = {slug: v for slug, v in values.items() if v is not None}
    if better not in ("higher", "lower") or len(numeric) < 2:
        return set()
    target = max(numeric.values()) if better == "higher" else min(numeric.values())
    best = {slug for slug, v in numeric.items() if v == target}
    return best if len(best) < len(numeric) else set()


def _lead_pct(values: dict[str, float | None], winner: str, better: str) -> float | None:
    others = [v for slug, v in values.items() if slug != winner and v is not None]
    if not others:
        return None
    runner_up = max(others) if better == "higher" else min(others)
    if not runner_up:
        return None
    return round(abs(values[winner] - runner_up) / runner_up * 100, 1)


def _join(words: list[str]) -> str:
    return words[0] if len(words) == 1 else ", ".join(words[:-1]) + " and " + words[-1]


def compare(products: list[Product]) -> CompareResult:
    """Compare 2+ products from one category (callers check that)."""
    category = products[0].category
    specs = {p.slug: {s.key: s for s in p.specs} for p in products}
    prices = {p.slug: lowest_price(p) for p in products}

    def numeric(slug: str, key: str) -> float | None:
        spec = specs[slug].get(key)
        return spec.value_num if spec else None

    # --- spec table
    best_price = _best(prices, "lower")
    rows = [CompareRow(key="price", label="Lowest price", unit="EUR", section="Price", better="lower",
                       cells=[CompareCell(product=slug, value=None if v is None else f"{v:.2f}", numeric=v,
                                          best=slug in best_price) for slug, v in prices.items()])]
    for definition in category.spec_definitions:
        values = {p.slug: numeric(p.slug, definition.key) for p in products}
        best = _best(values, definition.better)
        cells = []
        for p in products:
            spec = specs[p.slug].get(definition.key)
            cells.append(CompareCell(product=p.slug,
                                     value=format_spec(spec.value_text, definition.unit) if spec else None,
                                     numeric=spec.value_num if spec else None, best=p.slug in best))
        rows.append(CompareRow(key=definition.key, label=definition.label, unit=definition.unit,
                               section=definition.section, better=definition.better, cells=cells))

    # --- aspects (the "Performance · Price · Value" summary)
    better_by_key = {d.key: d.better for d in category.spec_definitions}
    aspects = []
    for aspect in category.aspects:
        key = aspect["key"]
        if key == "price":
            values, better = dict(prices), "lower"
        elif key == "value":
            basis = aspect["basis"]
            values = {}
            for slug, price in prices.items():
                score = numeric(slug, basis)
                values[slug] = round(score / price * 100, 2) if score is not None and price else None
            better = "higher"
        else:
            values = {p.slug: numeric(p.slug, key) for p in products}
            better = better_by_key.get(key) or "higher"
        best = _best(values, better)
        winner = next(iter(best)) if len(best) == 1 else None
        aspects.append(AspectResult(label=aspect["label"], key=key, better=better, winner=winner, values=values,
                                    lead_pct=_lead_pct(values, winner, better) if winner else None))

    # --- verdict
    names = {p.slug: p.name for p in products}
    wins: dict[str, list[str]] = {p.slug: [] for p in products}
    for aspect in aspects:
        if aspect.winner:
            wins[aspect.winner].append(aspect.label)
    ranked = sorted((slug for slug in wins if wins[slug]), key=lambda s: -len(wins[s]))
    if not ranked:
        verdict, winner = "Too close to call: these are evenly matched on every aspect we compare.", None
    else:
        verdict = "; ".join(f"{names[s]} wins on {_join(wins[s])}" for s in ranked) + "."
        top = len(wins[ranked[0]])
        winner = ranked[0] if sum(1 for s in ranked if len(wins[s]) == top) == 1 else None

    return CompareResult(category=category.slug, category_name=category.name,
                         products=[product_summary(p) for p in products],
                         aspects=aspects, rows=rows, winner=winner, verdict=verdict)
