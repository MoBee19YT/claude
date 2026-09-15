-- Parking Discovery - PostGIS schema
--
-- One table holds every parking facility/segment/space regardless of which
-- source(s) it came from. The schema is intentionally source-agnostic: it
-- was designed to be filled by OpenStreetMap first, but nothing here refers
-- to OSM specifically, so TomTom/HERE/municipal feeds can write into the
-- same rows (see backend/app/providers/).

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS parking (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Provenance. `primary_source`/`primary_source_id` identify the record
    -- that created this row (used as an idempotency key on re-import).
    -- `sources` accumulates every source that has contributed data to this
    -- row after merging (see services/merge_service.py).
    primary_source      TEXT NOT NULL,
    primary_source_id   TEXT NOT NULL,
    sources             TEXT[] NOT NULL DEFAULT '{}',
    source_ids          JSONB NOT NULL DEFAULT '{}', -- {"openstreetmap": "way/123", "tomtom": "..."}

    -- Geometry as it actually exists in the source data: a Point for a
    -- single space/entrance, a LineString for an on-street segment, a
    -- Polygon for a lot/garage footprint. We never fabricate a shape the
    -- source doesn't provide.
    geometry            geometry(Geometry, 4326) NOT NULL,
    centroid            geometry(Point, 4326) NOT NULL,

    -- lot | garage | street | space | unknown
    parking_type        TEXT NOT NULL DEFAULT 'unknown',
    -- public | private | customers | permit | residents | unknown
    access               TEXT,

    fee                 BOOLEAN,           -- true = paid, false = free, null = unknown
    price               NUMERIC,
    price_period        TEXT,              -- e.g. "hour", "day"
    currency             TEXT,

    capacity            INTEGER,
    capacity_disabled   INTEGER,

    opening_hours       TEXT,              -- raw OSM opening_hours syntax, shown verbatim if unparseable
    max_stay             TEXT,

    resident_only       BOOLEAN,
    ev                   BOOLEAN,
    accessible           BOOLEAN,
    covered              BOOLEAN,

    availability_count       INTEGER,       -- known free spaces right now, if a source provides it
    availability_type        TEXT NOT NULL DEFAULT 'unknown', -- realtime | predicted | static | unknown
    availability_updated     TIMESTAMPTZ,
    confidence                NUMERIC DEFAULT 0.5, -- 0..1, how much we'd trust this record

    name                TEXT,
    address              TEXT,
    country              TEXT,
    city                 TEXT,

    raw_tags             JSONB,             -- original source tags, kept for debugging/audit

    last_updated         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (primary_source, primary_source_id)
);

CREATE INDEX IF NOT EXISTS idx_parking_geometry ON parking USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_parking_centroid ON parking USING GIST (centroid);
CREATE INDEX IF NOT EXISTS idx_parking_type ON parking (parking_type);
CREATE INDEX IF NOT EXISTS idx_parking_city ON parking (city);
CREATE INDEX IF NOT EXISTS idx_parking_country ON parking (country);

-- Grid cache: tracks which ~2km cells have already been fetched from a
-- given live provider (Overpass, TomTom, HERE), so panning the map never
-- re-hits an external API for an area it has already cached - including
-- genuinely empty areas (a cell with zero parking is still marked as
-- "imported" so we don't keep asking). See services/parking_service.py.
CREATE TABLE IF NOT EXISTS import_cells (
    cell_x        INTEGER NOT NULL,
    cell_y        INTEGER NOT NULL,
    grid_size     NUMERIC NOT NULL,
    source        TEXT NOT NULL,
    feature_count INTEGER NOT NULL DEFAULT 0,
    imported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (cell_x, cell_y, source)
);
