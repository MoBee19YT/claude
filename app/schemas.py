"""Response models — these define the JSON the frontend receives (see /docs)."""
from datetime import date, datetime
from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class CategoryOut(BaseModel):
    slug: str
    name: str
    description: str
    icon: str
    product_count: int
    lowest_price: float | None


class SpecValue(BaseModel):
    key: str
    label: str
    value: str
    numeric: float | None
    unit: str | None
    display: str  # value and unit together, ready to render: "12 GB", "CL36", "DDR5"


class SpecSection(BaseModel):
    name: str
    specs: list[SpecValue]


class ProductSummary(BaseModel):
    slug: str
    name: str
    brand: str
    category: str
    category_name: str
    image: str | None
    summary: str
    lowest_price: float | None
    currency: str
    offer_count: int
    in_stock: bool
    headline_specs: list[SpecValue]


class OfferOut(BaseModel):
    shop: str
    shop_name: str
    shop_rating: float | None
    price: float
    currency: str
    in_stock: bool
    delivery_days: int
    url: str
    updated_at: datetime


class PriceStats(BaseModel):
    lowest: float | None
    highest: float | None
    average: float | None
    lowest_in_history: float | None  # cheapest daily price in the stored history
    offer_count: int


class ComparisonRef(BaseModel):
    slug: str
    title: str


class ProductDetail(ProductSummary):
    ean: str
    release_year: int | None
    spec_sections: list[SpecSection]
    offers: list[OfferOut]
    price_stats: PriceStats
    comparisons: list[ComparisonRef]


class PricePointOut(BaseModel):
    day: date
    price: float


class SearchHit(BaseModel):
    slug: str
    name: str
    brand: str
    category: str
    category_name: str
    icon: str
    image: str | None
    lowest_price: float | None
    currency: str


class CompareCell(BaseModel):
    product: str
    value: str | None
    numeric: float | None
    best: bool


class CompareRow(BaseModel):
    key: str
    label: str
    unit: str | None
    section: str
    better: str | None
    cells: list[CompareCell]


class AspectResult(BaseModel):
    label: str
    key: str
    better: str
    winner: str | None  # product slug, or None for a tie / missing data
    values: dict[str, float | None]
    lead_pct: float | None  # winner's margin over the runner-up, in percent


class CompareResult(BaseModel):
    category: str
    category_name: str
    products: list[ProductSummary]
    aspects: list[AspectResult]
    rows: list[CompareRow]
    winner: str | None
    verdict: str


class ComparisonProduct(BaseModel):
    slug: str
    name: str
    image: str | None
    lowest_price: float | None


class ComparisonCard(BaseModel):
    slug: str
    title: str
    description: str
    category: str
    category_name: str
    aspects: list[str]
    products: list[ComparisonProduct]


class ComparisonDetail(ComparisonCard):
    result: CompareResult


class ArticleSummary(BaseModel):
    slug: str
    title: str
    tag: str
    excerpt: str
    read_minutes: int
    published_on: date
    image: str | None


class ArticleDetail(ArticleSummary):
    body: str  # Markdown


class ShopOut(BaseModel):
    slug: str
    name: str
    website: str
    rating: float | None
    offer_count: int
    last_import: datetime | None


class Health(BaseModel):
    status: str
    products: int
    offers: int
    shops: int
    last_import: datetime | None
