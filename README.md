# ParkFind — Worldwide Parking Discovery (Prague MVP)

A real, working parking discovery map. It shows actual OpenStreetMap
parking data (lots, garages, street parking, individual spaces where
mapped), lets you search a destination, filter results, and rank nearby
parking by distance/price/availability/restrictions. It is architected to
grow from Prague to worldwide coverage and to plug in commercial data
sources (TomTom, HERE) without changing the data model.

**Nothing here fabricates data.** If a source doesn't say a price,
availability, or restriction, the app says "Information unavailable" /
"Availability unknown" instead of guessing.

## Why this stack

- **Backend: Python + FastAPI + PostgreSQL/PostGIS.** Parking is
  geographic data — PostGIS gives real spatial queries (bounding box,
  radius) instead of loading everything into the browser and filtering in
  JS. FastAPI is async (needed for calling Overpass/TomTom/HERE
  concurrently) and gives free interactive docs at `/docs`.
- **Frontend: React + TypeScript + MapLibre GL JS + Tailwind + Zustand.**
  MapLibre is open-source (no Mapbox token/billing) and supports pitch,
  rotation, polygons, and clustering out of the box. Zustand is a small
  shared store for filters/selection between the map and the UI panels.
- **Basemap: [OpenFreeMap](https://openfreemap.org).** Free, keyless
  vector tiles built on OpenStreetMap — no API key to configure or hide.

## Architecture

```
backend/
  app/
    config.py          Settings from environment variables (no hardcoded keys)
    database.py         Async SQLAlchemy engine/session
    models/parking.py   ORM model (mirrors db/init.sql)
    schemas/parking.py  Pydantic/GeoJSON API schemas
    providers/           One class per data source, same interface:
      base.py              NormalizedParking - the shared data shape
      osm_provider.py       OpenStreetMap via Overpass API
      tomtom_provider.py    TomTom Search API (needs TOMTOM_API_KEY)
      here_provider.py      HERE Discover API (needs HERE_API_KEY)
      registry.py           Lists all providers / which are configured
    services/
      merge_service.py     Dedupes/merges the same facility across sources
      parking_service.py   PostGIS queries, filters, live-fetch caching
      ranking_service.py   "Find Parking" scoring + human-readable reasons
      geocoding_service.py  Nominatim search proxy
      opening_hours.py      Small OSM opening_hours evaluator
    api/routes/           HTTP endpoints
  db/init.sql             PostGIS schema
  scripts/import_osm.py   Bulk OSM import for a city/region
frontend/
  src/
    components/Map/        MapLibre map, layers, zoom-dependent styling
    components/Search/     Destination search (Nominatim)
    components/Panel/      Parking details panel
    components/Filters/    Filter UI
    components/FindParking/ "Find Parking" button + ranked results
    components/Layout/     Top bar, legend
    store/useAppStore.ts   Shared UI state (Zustand)
    api/                   Typed API client
docker-compose.yml         postgis + backend + frontend, one command
```

### Data flow

1. **Import (once per region):** `scripts/import_osm.py` queries the
   Overpass API for a bounding box, normalizes every `amenity=parking`,
   `amenity=parking_space`, and `parking:lane/left/right/both` element into
   the shared `NormalizedParking` shape, and upserts it into PostGIS.
2. **Live fallback:** if you open the app on a map area nobody has
   imported yet, the backend fetches just that ~2km grid cell from
   Overpass on the fly, caches it, and serves it — so the app works
   immediately, not just after you remember to run the import script. A
   genuinely empty area is only ever checked once (see
   `services/parking_service.py`).
3. **Serving:** the frontend requests `/api/v1/parking?bbox=...&zoom=...`
   whenever the map is panned/zoomed (debounced). The backend runs a
   PostGIS `ST_Intersects` query, applies filters, and returns GeoJSON.
   MapLibre clusters points when zoomed out and renders actual
   polygons/lines/points as you zoom in — no fake "zone" shapes are
   invented for zoom levels the data doesn't support.
4. **Merging:** when more than one provider is configured, results
   within ~20m of each other and of a compatible type are merged into one
   facility, keeping OpenStreetMap as the base record and filling gaps
   (e.g. a name) from the other source. The merged record's `sources`
   list tracks every source that contributed.
5. **Find Parking:** `/api/v1/find-parking?lat=&lon=` runs a PostGIS
   radius query, then `ranking_service.py` scores each result by
   distance/price/availability/restrictions and returns why each one
   ranked where it did (e.g. `"150 m away", "Free parking"`).

## Setup

### Prerequisites

- Docker + Docker Compose (easiest), **or** Python 3.11+, Node 20+, and a
  local PostgreSQL 15+ with the PostGIS extension available.

### Option A — Docker Compose (recommended)

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up --build
```

- Backend: http://localhost:8000 (docs at http://localhost:8000/docs)
- Frontend: http://localhost:5173
- Postgres/PostGIS: localhost:5432 (user/pass/db: `parking`)

Open http://localhost:5173 — the map loads over Prague and starts
fetching real OpenStreetMap parking data live (via the grid-cache
fallback described above) as you pan around.

For full city-wide coverage (recommended before a demo, so panning is
instant instead of waiting on live Overpass calls), run the import once:

```bash
docker compose exec backend python -m scripts.import_osm
```

### Option B — Run without Docker

**Database:**

```bash
# Install PostgreSQL + PostGIS (e.g. on Ubuntu/Debian):
#   sudo apt install postgresql postgresql-16-postgis-3
createuser parking --pwprompt   # password: parking
createdb parking -O parking
psql -U parking -d parking -f backend/db/init.sql
```

**Backend:**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # adjust DATABASE_URL if needed
uvicorn app.main:app --reload
```

**Frontend** (in a second terminal):

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

**Import Prague's parking data** (optional but recommended - otherwise
the app fetches areas live the first time you pan over them):

```bash
cd backend
python -m scripts.import_osm
```

## Deploying to production (GitHub Pages + Render)

GitHub Pages only serves static files, so it can host the **frontend**
(it's just HTML/JS/CSS after `vite build`) but not the **backend** (it
needs a running process and a real PostgreSQL/PostGIS database). Split
them: frontend on GitHub Pages, backend + database on
[Render](https://render.com) (a Docker host, using the same
`backend/Dockerfile` already in this repo). Any other Docker + Postgres
host - Railway, Fly.io, a VPS - works the same way; swap step 2.

**1. Deploy the backend to Render**

- On render.com: **New +** → **Blueprint** → connect this repo → it reads
  `render.yaml` and provisions a web service + a PostgreSQL database.
- After it deploys, open a **Shell** on the `parking-db` database (or
  connect with `psql` using the External Connection String from its
  dashboard page) and run the schema once:
  ```bash
  psql "<external-connection-string>" -f backend/db/init.sql
  ```
- Note the backend's public URL, e.g. `https://parking-backend-xxxx.onrender.com`.
- In the `parking-backend` service's environment settings, set
  `CORS_ORIGINS` to your future GitHub Pages URL, e.g.
  `https://your-username.github.io`.
- (Optional) set `TOMTOM_API_KEY` / `HERE_API_KEY` there too - `render.yaml`
  leaves them blank on purpose so you paste real keys only in Render's
  dashboard, never in the repo.
- Free-tier notes: the web service spins down after ~15 min idle (first
  request after that takes ~30-60s to wake up) and the free database
  expires after 90 days - fine for trying this out, upgrade the plans in
  `render.yaml` for anything real.

**2. Point the frontend at it and deploy to GitHub Pages**

- Repo **Settings → Pages → Source**: select **GitHub Actions**.
- Repo **Settings → Secrets and variables → Actions → Variables**: add
  `VITE_API_BASE_URL` = `https://parking-backend-xxxx.onrender.com/api/v1`
  (the URL from step 1, with `/api/v1` on the end).
- Push to `main` (the included `.github/workflows/deploy-pages.yml`
  builds `frontend/` and deploys it automatically; it also currently
  triggers on `claude/parking-discovery-mvp-dxxfla` so you can verify the
  deploy before merging - trim that once you have).
- Your app is then live at `https://your-username.github.io/claude/`.

That's the whole loop: the GitHub Pages site is a static bundle that
calls the Render backend's `/api/v1/*` endpoints over HTTPS, exactly like
it calls `localhost:8000` in local dev - only `VITE_API_BASE_URL`
changes between the two.

## Filling the database on a hosted backend (no shell needed)

A fresh deployment has the tables but no parking in them, so the map will
be empty. `scripts/import_osm.py` is the normal way to fix that, but it
needs a shell on the server - which Render's free tier doesn't give you.
So the same import is also exposed as two endpoints you can just open in
a browser:

1. On your backend host, set an **`ADMIN_TOKEN`** environment variable to
   any long random string (Render: your service → Environment → Add
   Environment Variable). Without it, these endpoints refuse everything.
2. Import a region, a chunk at a time:
   ```
   https://YOUR-BACKEND/api/v1/admin/import?token=YOUR_TOKEN
   ```
   It returns immediately and fetches in the background. Add
   `&bbox=min_lon,min_lat,max_lon,max_lat` for somewhere other than
   `DEFAULT_BBOX`, and `&limit=N` to change how many ~2km cells each call
   does (default 40).
3. Watch progress:
   ```
   https://YOUR-BACKEND/api/v1/admin/status?token=YOUR_TOKEN
   ```
   `parking_facilities` is the row count. Re-run the import URL while the
   previous response's `remaining_after_this` is above 0.

Each call is deliberately chunked so it finishes well inside a small
instance's request/idle limits, and cells are fetched one per second to
stay a good citizen of the public Overpass API. All of Prague is roughly
300 cells, so expect to press it a handful of times.

## Expanding beyond Prague

Nothing in the code is Prague-specific - it's just the default bounding
box. To cover a new city or country:

```bash
python -m scripts.import_osm --bbox min_lon,min_lat,max_lon,max_lat --city "Berlin" --country "Germany"
```

Run it once per city/region you want pre-cached (for a country, run it
per major city rather than one giant bbox, to stay within Overpass's
fair-use limits). Anywhere you *haven't* pre-imported still works via the
live grid-cell fallback the first time someone views it.

## Adding TomTom / HERE API keys

The app runs correctly with zero keys (OpenStreetMap only). To add a
commercial source:

1. **TomTom:** create a free account at
   https://developer.tomtom.com/, generate an API key, and set
   `TOMTOM_API_KEY=...` in `backend/.env`.
2. **HERE:** create a free account at https://developer.here.com/,
   generate an API key, and set `HERE_API_KEY=...` in `backend/.env`.
3. Restart the backend. Check `GET /api/v1/meta/providers` (or the
   `/docs` page) to confirm the provider now shows `"configured": true`.

Both integrations use each vendor's standard place-search API, which
gives facility name/location - not live pricing or occupancy (that lives
behind separate, more restricted "availability" products most developer
accounts don't have). Those fields stay `null`/"unavailable" from these
two providers on purpose rather than being guessed; see the comments in
`backend/app/providers/tomtom_provider.py` and `here_provider.py` for
where to wire in real availability data if you get access to it.

## What's genuinely implemented vs. deliberately deferred

**Implemented and real:** OSM data ingestion (Overpass), PostGIS storage
and spatial queries, zoom-dependent clustering/rendering, a real
provider/merge architecture, filters, search (Nominatim), Find Parking
with an explainable ranking, a details panel that never invents a value,
geolocation, and external navigation handoff.

**Deferred (documented, not hidden):**
- No real-time occupancy sensors/cameras (excluded per the product
  brief) - `availability_type` stays `"unknown"`/`"static"` unless a
  future source provides it.
- TomTom/HERE integrations return location only, not live availability
  (see above).
- Cross-session merging: if you add a new provider key *after* an area
  is already cached, its results won't auto-merge with already-cached
  OSM rows until you re-run the import script for that area.
- No vector-tile pipeline yet - fine at city scale; worth adding
  (`tippecanoe`/`pg_tileserv`) before a true worldwide, millions-of-rows
  deployment.

## Attribution

Parking data is © OpenStreetMap contributors, available under the [Open
Database License](https://www.openstreetmap.org/copyright). The map UI
shows this attribution via MapLibre's attribution control (bottom-right).
Search uses the public Nominatim instance under its
[usage policy](https://operations.osmfoundation.org/policies/nominatim/) -
for real production traffic, self-host Nominatim or use a paid geocoder.
