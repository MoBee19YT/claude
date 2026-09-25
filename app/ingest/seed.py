"""Create the schema and fill it with the demo catalog.

    python -m app.ingest.seed           # create tables, seed if empty
    python -m app.ingest.seed --reset   # drop everything and seed again

Categories, products, specs, comparisons and articles come from
data/catalog.json. Prices come from importing each shop's feed, exactly as
they would in production.
"""
from __future__ import annotations

import argparse
import json
import random
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import DATA_DIR, PRICE_HISTORY_DAYS
from ..database import Base, SessionLocal, engine
from ..models import (Article, Category, Comparison, Offer, PricePoint, Product, ProductSpec, Shop,
                      SpecDefinition)
from .feeds import import_feed


def _spec_value(raw) -> tuple[str, float | None]:
    """Catalog values are a number, a string, or [number, "display text"]."""
    if isinstance(raw, list):
        number, text = raw
        return str(text), float(number)
    if isinstance(raw, (int, float)):
        return f"{raw:g}", float(raw)
    return str(raw), None


def seed(db: Session, catalog_path: Path = DATA_DIR / "catalog.json") -> None:
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))

    categories: dict[str, Category] = {}
    for position, c in enumerate(catalog["categories"]):
        category = Category(slug=c["slug"], name=c["name"], description=c["description"], icon=c["icon"],
                            position=position, aspects=c["aspects"])
        category.spec_definitions = [
            SpecDefinition(key=s["key"], label=s["label"], unit=s["unit"], better=s["better"],
                           section=s["section"], headline=s["headline"], position=i)
            for i, s in enumerate(c["specs"])]
        db.add(category)
        categories[c["slug"]] = category

    products: dict[str, Product] = {}
    for p in catalog["products"]:
        product = Product(slug=p["slug"], name=p["name"], brand=p["brand"], ean=p["ean"],
                          category=categories[p["category"]], image=p.get("image"), summary=p["summary"],
                          release_year=p.get("year"), popularity=p.get("popularity", 0))
        for key, raw in p["specs"].items():
            text, number = _spec_value(raw)
            product.specs.append(ProductSpec(key=key, value_text=text, value_num=number))
        db.add(product)
        products[p["slug"]] = product

    shops = [Shop(slug=s["slug"], name=s["name"], website=s["website"], feed_url=s["feed"], rating=s["rating"])
             for s in catalog["shops"]]
    db.add_all(shops)

    for c in catalog["comparisons"]:
        a, b = c["products"]
        db.add(Comparison(slug=c["slug"], title=c["title"], description=c["description"],
                          category=categories[c["category"]], product_a=products[a], product_b=products[b],
                          featured_rank=c.get("featured_rank")))

    for a in catalog["articles"]:
        db.add(Article(slug=a["slug"], title=a["title"], tag=a["tag"], excerpt=a["excerpt"], body=a["body"],
                       read_minutes=a["read_minutes"], published_on=date.fromisoformat(a["published_on"]),
                       image=a.get("image")))
    db.commit()

    for shop in shops:
        import_feed(db, shop)

    backfill_price_history(db)
    db.commit()


def backfill_price_history(db: Session, days: int = PRICE_HISTORY_DAYS) -> None:
    """Demo only: invent a plausible price history that ends at today's real lowest offer.

    A live deployment builds this up for real, one point per feed import per day.
    """
    today = date.today()
    for product in db.scalars(select(Product)):
        current = min((o.price for o in product.offers), default=None)
        if current is None:
            continue
        rng = random.Random(product.slug)  # deterministic per product
        known_days = {point.day for point in product.price_points}
        price = current
        for back in range(1, days + 1):
            # Walking backwards in time: prices change in steps, and hardware
            # tends to get cheaper, so the past was usually a little pricier.
            if rng.random() < 0.22:
                price *= 1 + rng.gauss(0.004, 0.025)
                price = min(max(price, current * 0.92), current * 1.2)
            day = today - timedelta(days=back)
            if day not in known_days:
                db.add(PricePoint(product_id=product.id, day=day, price=float(round(price))))


def init_db(seed_if_empty: bool = True, reset: bool = False) -> None:
    if reset:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    if seed_if_empty:
        with SessionLocal() as db:
            if not db.scalar(select(func.count(Product.id))):
                seed(db)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Create and seed the Qompify database.")
    parser.add_argument("--reset", action="store_true", help="drop all tables and seed again")
    args = parser.parse_args(argv)
    init_db(reset=args.reset)
    with SessionLocal() as db:
        counts = {model.__tablename__: db.scalar(select(func.count(model.id)))
                  for model in (Category, Product, Shop, Offer, PricePoint, Comparison, Article)}
    print("database ready:", ", ".join(f"{n} {t}" for t, n in counts.items()))


if __name__ == "__main__":
    main()
