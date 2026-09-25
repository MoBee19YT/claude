"""Featured comparisons and ad-hoc side-by-side comparison of any products."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Comparison, Product
from ..schemas import ComparisonCard, ComparisonDetail, ComparisonProduct, CompareResult
from ..services.products import lowest_price, product_loaders
from ..services.scoring import compare

router = APIRouter(tags=["compare"])


def _comparison_query():
    return select(Comparison).options(
        selectinload(Comparison.category),
        selectinload(Comparison.product_a).options(*product_loaders()),
        selectinload(Comparison.product_b).options(*product_loaders()))


def _card(c: Comparison) -> ComparisonCard:
    return ComparisonCard(
        slug=c.slug, title=c.title, description=c.description,
        category=c.category.slug, category_name=c.category.name,
        aspects=[a["label"] for a in c.category.aspects],
        products=[ComparisonProduct(slug=p.slug, name=p.name, image=p.image, lowest_price=lowest_price(p))
                  for p in (c.product_a, c.product_b)])


@router.get("/comparisons", response_model=list[ComparisonCard])
def list_comparisons(db: Session = Depends(get_db)):
    """All editorial comparisons, featured ones first."""
    rows = db.scalars(_comparison_query().order_by(Comparison.featured_rank.is_(None), Comparison.featured_rank,
                                                   Comparison.title)).all()
    return [_card(c) for c in rows]


@router.get("/comparisons/popular", response_model=list[ComparisonCard])
def popular_comparisons(limit: int = Query(3, ge=1, le=12), db: Session = Depends(get_db)):
    """The homepage "Popular comparisons" cards."""
    rows = db.scalars(_comparison_query().where(Comparison.featured_rank.is_not(None))
                      .order_by(Comparison.featured_rank).limit(limit)).all()
    return [_card(c) for c in rows]


@router.get("/comparisons/{slug}", response_model=ComparisonDetail)
def get_comparison(slug: str, db: Session = Depends(get_db)):
    c = db.scalar(_comparison_query().where(Comparison.slug == slug))
    if c is None:
        raise HTTPException(404, f"Comparison '{slug}' not found")
    return ComparisonDetail(**_card(c).model_dump(), result=compare([c.product_a, c.product_b]))


@router.get("/compare", response_model=CompareResult)
def compare_products(
    products: str = Query(..., description="2–4 product slugs, comma-separated",
                          examples=["geforce-rtx-4070,radeon-rx-7800-xt"]),
    db: Session = Depends(get_db),
):
    """Compare any 2–4 products from the same category."""
    slugs = list(dict.fromkeys(s.strip() for s in products.split(",") if s.strip()))
    if not 2 <= len(slugs) <= 4:
        raise HTTPException(400, "Pass between 2 and 4 different product slugs")
    found = {p.slug: p for p in db.scalars(select(Product).where(Product.slug.in_(slugs))
                                            .options(*product_loaders()))}
    missing = [s for s in slugs if s not in found]
    if missing:
        raise HTTPException(404, f"Unknown product(s): {', '.join(missing)}")
    categories = {found[s].category.slug for s in slugs}
    if len(categories) > 1:
        raise HTTPException(400, f"Products must be in the same category (got {', '.join(sorted(categories))})")
    return compare([found[s] for s in slugs])
