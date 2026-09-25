"""Categories, product listings, product pages, price history and search."""
import math
import re
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..config import CURRENCY, PRICE_HISTORY_DAYS
from ..database import get_db
from ..models import Category, Comparison, Offer, PricePoint, Product
from ..schemas import (CategoryOut, ComparisonRef, OfferOut, Page, PricePointOut, PriceStats, ProductDetail,
                       ProductSummary, SearchHit, SpecSection)
from ..services.products import lowest_price, product_loaders, product_summary, spec_values

router = APIRouter(tags=["catalog"])

SortOption = Literal["popular", "price_asc", "price_desc", "name", "newest"]


def _like(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _lowest_prices():
    return (select(Offer.product_id, func.min(Offer.price).label("lowest"))
            .group_by(Offer.product_id).subquery())


def _get_product(db: Session, slug: str) -> Product:
    product = db.scalar(select(Product).where(Product.slug == slug).options(*product_loaders()))
    if product is None:
        raise HTTPException(404, f"Product '{slug}' not found")
    return product


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    """Category shortcuts, with product counts and each category's cheapest offer."""
    lowest = _lowest_prices()
    rows = db.execute(
        select(Category, func.count(Product.id), func.min(lowest.c.lowest))
        .outerjoin(Product, Product.category_id == Category.id)
        .outerjoin(lowest, lowest.c.product_id == Product.id)
        .group_by(Category.id)
        .order_by(Category.position)).all()
    return [CategoryOut(slug=c.slug, name=c.name, description=c.description, icon=c.icon,
                        product_count=count, lowest_price=cheapest) for c, count, cheapest in rows]


@router.get("/products", response_model=Page[ProductSummary])
def list_products(
    category: str | None = Query(None, description="category slug, e.g. gpu"),
    brand: str | None = Query(None, description="one or more brands, comma-separated"),
    q: str | None = Query(None, description="text filter on name, brand and category"),
    min_price: float | None = Query(None, ge=0),
    max_price: float | None = Query(None, ge=0),
    in_stock: bool = Query(False, description="only products at least one shop has in stock"),
    sort: SortOption = "popular",
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=60),
    db: Session = Depends(get_db),
):
    lowest = _lowest_prices()
    stmt = (select(Product).join(Category, Product.category_id == Category.id)
            .outerjoin(lowest, lowest.c.product_id == Product.id))
    if category:
        stmt = stmt.where(Category.slug == category)
    if brand:
        brands = [b.strip().lower() for b in brand.split(",") if b.strip()]
        stmt = stmt.where(func.lower(Product.brand).in_(brands))
    for term in (q or "").split():
        pattern = _like(term)
        stmt = stmt.where(or_(Product.name.ilike(pattern, escape="\\"), Product.brand.ilike(pattern, escape="\\"),
                              Category.name.ilike(pattern, escape="\\")))
    if min_price is not None:
        stmt = stmt.where(lowest.c.lowest >= min_price)
    if max_price is not None:
        stmt = stmt.where(lowest.c.lowest <= max_price)
    if in_stock:
        stmt = stmt.where(Product.offers.any(Offer.in_stock.is_(True)))

    no_price_last = case((lowest.c.lowest.is_(None), 1), else_=0)  # portable "NULLS LAST"
    order = {
        "popular": (Product.popularity.desc(), Product.name),
        "price_asc": (no_price_last, lowest.c.lowest.asc(), Product.name),
        "price_desc": (no_price_last, lowest.c.lowest.desc(), Product.name),
        "name": (Product.name,),
        "newest": (Product.release_year.desc(), Product.popularity.desc()),
    }[sort]

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    products = db.scalars(stmt.order_by(*order).options(*product_loaders())
                          .limit(page_size).offset((page - 1) * page_size)).all()
    return Page[ProductSummary](items=[product_summary(p) for p in products], total=total, page=page,
                                page_size=page_size, pages=max(1, math.ceil(total / page_size)))


@router.get("/products/{slug}", response_model=ProductDetail)
def get_product(slug: str, db: Session = Depends(get_db)):
    """Full product page: grouped specs, every shop's offer (cheapest first) and related comparisons."""
    product = _get_product(db, slug)
    summary = product_summary(product)

    sections: dict[str, SpecSection] = {}
    by_key = {d.key: d for d in product.category.spec_definitions}
    for value in spec_values(product):
        name = by_key[value.key].section
        sections.setdefault(name, SpecSection(name=name, specs=[])).specs.append(value)

    offers = sorted(product.offers, key=lambda o: (o.price, not o.in_stock))
    prices = [o.price for o in offers]
    lowest_in_history = db.scalar(select(func.min(PricePoint.price)).where(PricePoint.product_id == product.id))

    comparisons = db.scalars(select(Comparison)
                             .where(or_(Comparison.product_a_id == product.id, Comparison.product_b_id == product.id))
                             .order_by(Comparison.featured_rank.is_(None), Comparison.featured_rank)).all()

    return ProductDetail(
        **summary.model_dump(),
        ean=product.ean, release_year=product.release_year,
        spec_sections=list(sections.values()),
        offers=[OfferOut(shop=o.shop.slug, shop_name=o.shop.name, shop_rating=o.shop.rating, price=o.price,
                         currency=o.currency, in_stock=o.in_stock, delivery_days=o.delivery_days, url=o.url,
                         updated_at=o.updated_at) for o in offers],
        price_stats=PriceStats(lowest=min(prices, default=None), highest=max(prices, default=None),
                               average=round(sum(prices) / len(prices), 2) if prices else None,
                               lowest_in_history=lowest_in_history, offer_count=len(prices)),
        comparisons=[ComparisonRef(slug=c.slug, title=c.title) for c in comparisons])


@router.get("/products/{slug}/price-history", response_model=list[PricePointOut])
def price_history(slug: str, days: int = Query(PRICE_HISTORY_DAYS, ge=1, le=365), db: Session = Depends(get_db)):
    """Daily lowest price, oldest first — ready for a line chart."""
    product = db.scalar(select(Product).where(Product.slug == slug))
    if product is None:
        raise HTTPException(404, f"Product '{slug}' not found")
    since = date.today() - timedelta(days=days)
    points = db.scalars(select(PricePoint)
                        .where(PricePoint.product_id == product.id, PricePoint.day >= since)
                        .order_by(PricePoint.day)).all()
    return [PricePointOut(day=p.day, price=p.price) for p in points]


SEARCH_CANDIDATES = 200


def _relevance(product: Product, terms: list[str], query: str) -> int:
    """Whole-word matches outrank partial ones, so "ryzen 7" lists Ryzen 7 chips before the Ryzen 5 7600."""
    words = re.split(r"[\s\-/]+", f"{product.brand} {product.name} {product.category.name}".lower())
    score = 100 if product.name.lower().startswith(query) else 0
    for term in terms:
        if term in words:
            score += 10
        elif any(w.startswith(term) for w in words):
            score += 5
    return score


@router.get("/search", response_model=list[SearchHit])
def search(q: str = Query("", max_length=80), limit: int = Query(6, ge=1, le=20), db: Session = Depends(get_db)):
    """Search-as-you-type suggestions. Every word must appear in the name, brand or category.

    An empty query returns the most popular products (the "Popular right now" list).
    """
    stmt = (select(Product).join(Category, Product.category_id == Category.id)
            .options(selectinload(Product.category), selectinload(Product.offers)))
    terms = [t.lower() for t in q.split()]
    if not terms:
        products = db.scalars(stmt.order_by(Product.popularity.desc()).limit(limit)).all()
    else:
        for term in terms:
            pattern = _like(term)
            stmt = stmt.where(or_(Product.name.ilike(pattern, escape="\\"),
                                  Product.brand.ilike(pattern, escape="\\"),
                                  Category.name.ilike(pattern, escape="\\")))
        # SQL finds the matches; ranking them in Python is fine at catalog scale.
        # (A large catalog would move this to Postgres full-text or trigram search.)
        candidates = db.scalars(stmt.order_by(Product.popularity.desc()).limit(SEARCH_CANDIDATES)).all()
        query = " ".join(terms)
        products = sorted(candidates, key=lambda p: (-_relevance(p, terms, query), -p.popularity))[:limit]

    return [SearchHit(slug=p.slug, name=p.name, brand=p.brand, category=p.category.slug,
                      category_name=p.category.name, icon=p.category.icon, image=p.image,
                      lowest_price=lowest_price(p), currency=CURRENCY) for p in products]
