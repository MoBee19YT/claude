"""Articles & guides, and the shops whose feeds supply prices."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Article, Offer, Shop
from ..schemas import ArticleDetail, ArticleSummary, ShopOut

router = APIRouter(tags=["content"])


@router.get("/articles", response_model=list[ArticleSummary])
def list_articles(tag: str | None = Query(None, description="e.g. Memory"), limit: int = Query(12, ge=1, le=50),
                  db: Session = Depends(get_db)):
    """Latest articles & guides, newest first."""
    stmt = select(Article).order_by(Article.published_on.desc()).limit(limit)
    if tag:
        stmt = stmt.where(func.lower(Article.tag) == tag.lower())
    return [ArticleSummary.model_validate(a, from_attributes=True) for a in db.scalars(stmt)]


@router.get("/articles/{slug}", response_model=ArticleDetail)
def get_article(slug: str, db: Session = Depends(get_db)):
    article = db.scalar(select(Article).where(Article.slug == slug))
    if article is None:
        raise HTTPException(404, f"Article '{slug}' not found")
    return ArticleDetail.model_validate(article, from_attributes=True)


@router.get("/shops", response_model=list[ShopOut])
def list_shops(db: Session = Depends(get_db)):
    """Shops whose product feeds are imported, and when each was last refreshed."""
    rows = db.execute(select(Shop, func.count(Offer.id)).outerjoin(Offer, Offer.shop_id == Shop.id)
                      .group_by(Shop.id).order_by(Shop.name)).all()
    return [ShopOut(slug=s.slug, name=s.name, website=s.website, rating=s.rating, offer_count=count,
                    last_import=s.last_import) for s, count in rows]
