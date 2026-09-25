"""Import shop product feeds into the offers table.

Comparison sites get prices the way Heureka does: each shop publishes an XML
product feed, and the site imports it on a schedule. This module reads that
format (the commonly used subset):

    <SHOP>
      <SHOPITEM>
        <ITEM_ID>TN-10231</ITEM_ID>
        <PRODUCTNAME>NVIDIA GeForce RTX 4070</PRODUCTNAME>
        <URL>https://shop.example/p/tn-10231</URL>
        <PRICE_VAT>579.00</PRICE_VAT>
        <EAN>2000000010013</EAN>
        <DELIVERY_DATE>0</DELIVERY_DATE>   0 = in stock, N = days, or a YYYY-MM-DD date
      </SHOPITEM>
    </SHOP>

Items are matched to catalog products by EAN. An import replaces the shop's
offers: new items are added, known ones updated, missing ones removed.

    python -m app.ingest.feeds technova                       # re-import the stored feed
    python -m app.ingest.feeds technova data/feeds/technova.xml
    python -m app.ingest.feeds newshop https://newshop.example/feed.xml \\
        --name "New Shop" --website https://newshop.example   # register a new shop
"""
from __future__ import annotations

import argparse
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path

from defusedxml import ElementTree
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import BASE_DIR, CURRENCY
from ..models import Offer, PricePoint, Product, Shop

MAX_FEED_BYTES = 50 * 1024 * 1024


@dataclass
class FeedItem:
    item_id: str
    name: str
    ean: str
    price: float
    url: str
    delivery_days: int


@dataclass
class ImportReport:
    shop: str
    items: int = 0
    created: int = 0
    updated: int = 0
    removed: int = 0
    unmatched: list[str] = field(default_factory=list)
    invalid: list[str] = field(default_factory=list)

    def __str__(self) -> str:
        line = (f"{self.shop}: {self.items} items · {self.created} new · {self.updated} updated · "
                f"{self.removed} removed · {len(self.unmatched)} unmatched · {len(self.invalid)} invalid")
        if self.unmatched:
            line += "\n  unmatched (no product with that EAN): " + ", ".join(self.unmatched)
        if self.invalid:
            line += "\n  invalid (missing id or bad price): " + ", ".join(self.invalid)
        return line


def read_source(source: str) -> bytes:
    """Fetch a feed from an http(s) URL, or read it from a file (relative paths start at the project root)."""
    if source.startswith(("http://", "https://")):
        request = urllib.request.Request(source, headers={"User-Agent": "QompifyFeedImporter/0.1"})
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read(MAX_FEED_BYTES + 1)
    else:
        path = Path(source)
        data = (path if path.is_absolute() else BASE_DIR / path).read_bytes()
    if len(data) > MAX_FEED_BYTES:
        raise ValueError(f"feed is larger than {MAX_FEED_BYTES // 1024 // 1024} MB")
    return data


def _text(element, tag: str) -> str:
    child = element.find(tag)
    return (child.text or "").strip() if child is not None else ""


def _delivery_days(raw: str, today: date) -> int:
    if not raw:
        return 0
    if raw.isdigit():
        return int(raw)
    return max(0, (date.fromisoformat(raw) - today).days)


def parse_feed(data: bytes, today: date | None = None) -> tuple[list[FeedItem], list[str]]:
    """Return (valid items, ids of items that were skipped as invalid)."""
    today = today or date.today()
    items, invalid = [], []
    for element in ElementTree.fromstring(data).iter("SHOPITEM"):
        item_id = _text(element, "ITEM_ID")
        try:
            price = float(_text(element, "PRICE_VAT").replace(",", "."))
            delivery = _delivery_days(_text(element, "DELIVERY_DATE"), today)
        except ValueError:
            invalid.append(item_id or "?")
            continue
        if not item_id or price <= 0:
            invalid.append(item_id or "?")
            continue
        items.append(FeedItem(item_id=item_id, name=_text(element, "PRODUCTNAME"), ean=_text(element, "EAN"),
                              price=price, url=_text(element, "URL"), delivery_days=delivery))
    return items, invalid


def record_lowest_prices(db: Session, product_ids: set[int], day: date) -> None:
    """Store each product's current lowest offer as that day's price-history point."""
    if not product_ids:
        return
    lowest = dict(db.execute(
        select(Offer.product_id, func.min(Offer.price))
        .where(Offer.product_id.in_(product_ids))
        .group_by(Offer.product_id)).all())
    points = {p.product_id: p for p in db.scalars(
        select(PricePoint).where(PricePoint.product_id.in_(product_ids), PricePoint.day == day))}
    for product_id in product_ids:
        price, point = lowest.get(product_id), points.get(product_id)
        if price is None:
            if point is not None:
                db.delete(point)
        elif point is None:
            db.add(PricePoint(product_id=product_id, day=day, price=price))
        else:
            point.price = price


def import_feed(db: Session, shop: Shop, source: str | None = None) -> ImportReport:
    """Import one shop's feed. Commits on success."""
    today = date.today()
    items, invalid = parse_feed(read_source(source or shop.feed_url), today)
    report = ImportReport(shop=shop.slug, items=len(items), invalid=invalid)

    # If a shop lists the same product twice, keep its cheapest listing.
    cheapest: dict[str, FeedItem] = {}
    for item in items:
        if item.ean not in cheapest or item.price < cheapest[item.ean].price:
            cheapest[item.ean] = item

    products = {p.ean: p for p in db.scalars(select(Product).where(Product.ean.in_(list(cheapest))))}
    existing = {o.product_id: o for o in db.scalars(select(Offer).where(Offer.shop_id == shop.id))}
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    seen: set[int] = set()

    for ean, item in cheapest.items():
        product = products.get(ean)
        if product is None:
            report.unmatched.append(f"{item.item_id} {item.name}".strip())
            continue
        seen.add(product.id)
        offer = existing.get(product.id)
        if offer is None:
            offer = Offer(product_id=product.id, shop_id=shop.id)
            db.add(offer)
            report.created += 1
        else:
            report.updated += 1
        offer.shop_item_id = item.item_id
        offer.price = item.price
        offer.currency = CURRENCY
        offer.in_stock = item.delivery_days == 0
        offer.delivery_days = item.delivery_days
        offer.url = item.url
        offer.updated_at = now

    removed = set(existing) - seen
    for product_id in removed:
        db.delete(existing[product_id])
    report.removed = len(removed)

    shop.last_import = now
    db.flush()
    record_lowest_prices(db, seen | removed, today)
    db.commit()
    return report


def main(argv: list[str] | None = None) -> None:
    from ..database import SessionLocal
    from .seed import init_db

    parser = argparse.ArgumentParser(description="Import a shop's product feed into the Qompify database.")
    parser.add_argument("shop", help="shop slug, e.g. technova")
    parser.add_argument("source", nargs="?", help="feed file or http(s) URL (default: the shop's stored feed)")
    parser.add_argument("--name", help="register the shop under this name if it does not exist yet")
    parser.add_argument("--website", help="shop website, used with --name")
    args = parser.parse_args(argv)

    init_db()
    with SessionLocal() as db:
        shop = db.scalar(select(Shop).where(Shop.slug == args.shop))
        if shop is None:
            if not (args.name and args.source):
                known = ", ".join(db.scalars(select(Shop.slug)))
                parser.error(f"unknown shop '{args.shop}' (known: {known}). "
                             "To add a new shop, pass a feed source and --name.")
            shop = Shop(slug=args.shop, name=args.name, website=args.website or args.source,
                        feed_url=args.source)
            db.add(shop)
            db.flush()
        print(import_feed(db, shop, args.source))


if __name__ == "__main__":
    main()
