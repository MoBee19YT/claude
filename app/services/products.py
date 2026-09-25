"""Turning Product rows into API responses."""
from sqlalchemy.orm import selectinload

from ..config import CURRENCY
from ..models import Category, Offer, Product
from ..schemas import ProductSummary, SpecValue

PREFIX_UNITS = {"CL"}  # written before the number: CL36


def product_loaders():
    """Eager-load everything product_summary() touches, avoiding one query per product."""
    return (selectinload(Product.specs),
            selectinload(Product.offers).selectinload(Offer.shop),
            selectinload(Product.category).selectinload(Category.spec_definitions))


def lowest_price(product: Product) -> float | None:
    return min((o.price for o in product.offers), default=None)


def format_spec(value: str, unit: str | None) -> str:
    if not unit or value == "—":
        return value
    return f"{unit}{value}" if unit in PREFIX_UNITS else f"{value} {unit}"


def spec_values(product: Product, headline_only: bool = False) -> list[SpecValue]:
    by_key = {s.key: s for s in product.specs}
    values = []
    for definition in product.category.spec_definitions:
        spec = by_key.get(definition.key)
        if spec is None or (headline_only and not definition.headline):
            continue
        values.append(SpecValue(key=definition.key, label=definition.label, value=spec.value_text,
                                numeric=spec.value_num, unit=definition.unit,
                                display=format_spec(spec.value_text, definition.unit)))
    return values


def product_summary(product: Product) -> ProductSummary:
    return ProductSummary(
        slug=product.slug, name=product.name, brand=product.brand,
        category=product.category.slug, category_name=product.category.name,
        image=product.image, summary=product.summary,
        lowest_price=lowest_price(product), currency=CURRENCY,
        offer_count=len(product.offers), in_stock=any(o.in_stock for o in product.offers),
        headline_specs=spec_values(product, headline_only=True))
