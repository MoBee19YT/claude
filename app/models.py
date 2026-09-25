"""SQL schema.

categories ─┬─ spec_definitions      what can be compared within a category
            └─ products ─┬─ product_specs    one row per spec value
                         ├─ offers ── shops  current price per shop (from feeds)
                         └─ price_history    daily lowest price
comparisons, articles                        editorial content
"""
from datetime import date, datetime

from sqlalchemy import (JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, Numeric, String, Text,
                        UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

Money = Numeric(10, 2, asdecimal=False)


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(200))
    icon: Mapped[str] = mapped_column(String(40))
    position: Mapped[int] = mapped_column(Integer, default=0)
    # [{"label": "Performance", "key": "perf_score"}, ...] — drives comparison verdicts
    aspects: Mapped[list] = mapped_column(JSON, default=list)

    products: Mapped[list["Product"]] = relationship(back_populates="category")
    spec_definitions: Mapped[list["SpecDefinition"]] = relationship(
        order_by="SpecDefinition.position", cascade="all, delete-orphan")


class SpecDefinition(Base):
    __tablename__ = "spec_definitions"
    __table_args__ = (UniqueConstraint("category_id", "key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    key: Mapped[str] = mapped_column(String(40))
    label: Mapped[str] = mapped_column(String(80))
    unit: Mapped[str | None] = mapped_column(String(20))
    better: Mapped[str | None] = mapped_column(String(10))  # "higher", "lower" or None (not ranked)
    section: Mapped[str] = mapped_column(String(40))
    position: Mapped[int] = mapped_column(Integer, default=0)
    headline: Mapped[bool] = mapped_column(Boolean, default=False)  # shown on product cards


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    brand: Mapped[str] = mapped_column(String(80), index=True)
    ean: Mapped[str] = mapped_column(String(14), unique=True)  # used to match shop feed items
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), index=True)
    image: Mapped[str | None] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(String(300), default="")
    release_year: Mapped[int | None] = mapped_column(Integer)
    popularity: Mapped[int] = mapped_column(Integer, default=0)

    category: Mapped[Category] = relationship(back_populates="products")
    specs: Mapped[list["ProductSpec"]] = relationship(cascade="all, delete-orphan")
    offers: Mapped[list["Offer"]] = relationship(back_populates="product", cascade="all, delete-orphan")
    price_points: Mapped[list["PricePoint"]] = relationship(
        order_by="PricePoint.day", cascade="all, delete-orphan")


class ProductSpec(Base):
    __tablename__ = "product_specs"
    __table_args__ = (UniqueConstraint("product_id", "key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    key: Mapped[str] = mapped_column(String(40))
    value_text: Mapped[str] = mapped_column(String(160))
    value_num: Mapped[float | None] = mapped_column(Float)  # set when the value can be ranked


class Shop(Base):
    __tablename__ = "shops"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    website: Mapped[str] = mapped_column(String(200))
    feed_url: Mapped[str] = mapped_column(String(300))
    rating: Mapped[float | None] = mapped_column(Float)
    last_import: Mapped[datetime | None] = mapped_column(DateTime)

    offers: Mapped[list["Offer"]] = relationship(back_populates="shop", cascade="all, delete-orphan")


class Offer(Base):
    __tablename__ = "offers"
    __table_args__ = (UniqueConstraint("product_id", "shop_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    shop_item_id: Mapped[str] = mapped_column(String(80))
    price: Mapped[float] = mapped_column(Money)
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    in_stock: Mapped[bool] = mapped_column(Boolean, default=True)
    delivery_days: Mapped[int] = mapped_column(Integer, default=0)
    url: Mapped[str] = mapped_column(String(300))
    updated_at: Mapped[datetime] = mapped_column(DateTime)

    product: Mapped[Product] = relationship(back_populates="offers")
    shop: Mapped[Shop] = relationship(back_populates="offers")


class PricePoint(Base):
    __tablename__ = "price_history"
    __table_args__ = (UniqueConstraint("product_id", "day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    day: Mapped[date] = mapped_column(Date)
    price: Mapped[float] = mapped_column(Money)  # lowest offer that day


class Comparison(Base):
    __tablename__ = "comparisons"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(String(300))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    product_a_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    product_b_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    featured_rank: Mapped[int | None] = mapped_column(Integer)  # set = shown on the homepage

    category: Mapped[Category] = relationship()
    product_a: Mapped[Product] = relationship(foreign_keys=[product_a_id])
    product_b: Mapped[Product] = relationship(foreign_keys=[product_b_id])


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    tag: Mapped[str] = mapped_column(String(40))
    excerpt: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)  # Markdown
    read_minutes: Mapped[int] = mapped_column(Integer)
    published_on: Mapped[date] = mapped_column(Date)
    image: Mapped[str | None] = mapped_column(String(200))
