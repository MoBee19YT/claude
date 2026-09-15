"""
SQLAlchemy ORM model mirroring backend/db/init.sql.

This mirrors the SQL schema by hand rather than generating it, so the
canonical source of truth for the table shape is init.sql (kept simple
on purpose - no Alembic migration framework for this MVP; see README for
how to evolve the schema later).
"""
import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import ARRAY, Boolean, DateTime, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Parking(Base):
    __tablename__ = "parking"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    primary_source: Mapped[str] = mapped_column(String, nullable=False)
    primary_source_id: Mapped[str] = mapped_column(String, nullable=False)
    sources: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    source_ids: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    geometry = mapped_column(Geometry(geometry_type="GEOMETRY", srid=4326), nullable=False)
    centroid = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)

    parking_type: Mapped[str] = mapped_column(String, nullable=False, default="unknown")
    access: Mapped[str | None] = mapped_column(String, nullable=True)

    fee: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    price: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    price_period: Mapped[str | None] = mapped_column(String, nullable=True)
    currency: Mapped[str | None] = mapped_column(String, nullable=True)

    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    capacity_disabled: Mapped[int | None] = mapped_column(Integer, nullable=True)

    opening_hours: Mapped[str | None] = mapped_column(String, nullable=True)
    max_stay: Mapped[str | None] = mapped_column(String, nullable=True)

    resident_only: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    ev: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    accessible: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    covered: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    availability_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    availability_type: Mapped[str] = mapped_column(String, nullable=False, default="unknown")
    availability_updated: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Numeric, nullable=True, default=0.5)

    name: Mapped[str | None] = mapped_column(String, nullable=True)
    address: Mapped[str | None] = mapped_column(String, nullable=True)
    country: Mapped[str | None] = mapped_column(String, nullable=True)
    city: Mapped[str | None] = mapped_column(String, nullable=True)

    raw_tags: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    last_updated: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ImportCell(Base):
    """Grid cache of which ~2km cells have already been fetched from which
    live provider - see services/parking_service.py."""

    __tablename__ = "import_cells"

    cell_x: Mapped[int] = mapped_column(Integer, primary_key=True)
    cell_y: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String, primary_key=True)
    grid_size: Mapped[float] = mapped_column(Numeric, nullable=False)
    feature_count: Mapped[int] = mapped_column(Integer, default=0)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
