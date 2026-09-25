# Qompify API — backend demo

A FastAPI + SQL backend for **Qompify**, the hardware comparison site
([frontend repo](https://github.com/MoBee19YT/Qompify-Frontend)). It serves categories, products,
shop prices, price history, search, comparisons and articles as JSON.

## Quick start

Needs Python 3.10 or newer.

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open **http://127.0.0.1:8000/docs** for interactive docs, where you can try every endpoint.
The first start creates `qompify.db` (SQLite) and fills it with the demo data.

## Where the data comes from

```
data/catalog.json   ──►  categories, products, specs, comparisons, articles
data/feeds/*.xml    ──►  offers (each shop's price)  ──►  price_history (daily lowest)
```

Prices come from **shop product feeds**, the same way Heureka gets them: each shop publishes
an XML file listing its products and prices, and Qompify imports it. Feed items are matched to
products by EAN barcode. This is more reliable than scraping shop pages, which breaks whenever a
layout changes and usually goes against the shop's terms.

The demo ships feeds for four fictional shops. Re-import one, or add a real shop by its feed URL:

```bash
python -m app.ingest.feeds technova                                # re-import a stored feed
python -m app.ingest.feeds newshop https://newshop.example/feed.xml \
    --name "New Shop" --website https://newshop.example             # register a new shop
python -m app.ingest.seed --reset                                  # rebuild the whole database
```

Each import prints a report — new, updated and removed offers, plus items it couldn't match to a
product. Run the feed command on a schedule (e.g. cron, hourly) to keep prices fresh; each run
also records that day's lowest price, which builds the price history.

## Endpoints

All endpoints are `GET` and live under `/api`.

| Endpoint | Returns |
| --- | --- |
| `/categories` | The 6 categories with product counts and the cheapest price in each |
| `/products` | Product cards. Filters: `category`, `brand` (comma-separated), `q`, `min_price`, `max_price`, `in_stock`. `sort`: `popular`, `price_asc`, `price_desc`, `name`, `newest`. Paginated with `page`, `page_size` |
| `/products/{slug}` | Product page: grouped specs, every shop's offer (cheapest first), price stats, related comparisons |
| `/products/{slug}/price-history?days=90` | Daily lowest price, oldest first, for a chart |
| `/search?q=rtx&limit=6` | Search-as-you-type suggestions; an empty `q` returns the most popular products |
| `/comparisons/popular` | The homepage comparison cards |
| `/comparisons` · `/comparisons/{slug}` | All editorial comparisons · one with its full result |
| `/compare?products=a,b` | Compare any 2–4 products from one category: spec table with the best value marked, per-aspect winners and a one-line verdict |
| `/articles?tag=Memory` · `/articles/{slug}` | Guides, newest first · one guide with its Markdown body |
| `/shops` | Shops whose feeds are imported, with offer counts and last import time |
| `/health` | Status and row counts |

Errors come back as `{"detail": "..."}` with 404 (unknown slug), 400 (e.g. comparing a GPU with a CPU)
or 422 (invalid query parameter).

## Wiring up the frontend

| Homepage section | Endpoint | Notes |
| --- | --- | --- |
| Search bar dropdown | `/search?q=…` | `icon` matches the frontend's icon names (`cpu`, `gpu`, `ram`, …) |
| Category cards | `/categories` | |
| Popular comparisons | `/comparisons/popular` | `aspects` is the "Performance · Price · Value" line |
| Why Qompify? | — | Static text, stays in the frontend |
| Latest articles & guides | `/articles?limit=4` | |

```js
const API = "http://127.0.0.1:8000/api";

const hits = await fetch(`${API}/search?q=${encodeURIComponent(query)}`).then(r => r.json());
// → [{ slug, name, brand, category, category_name, icon, image, lowest_price, currency }, ...]
```

`image` values such as `assets/gpu-rtx.svg` point at files in the frontend repo, so they resolve
relative to the frontend page. Products without artwork have `image: null`; show the category icon.
Spec values include a ready-to-render `display` string (`"12 GB"`, `"CL36"`, `"165 Hz"`).

The prices match what the static frontend shows today (RTX 4070 from €579, and so on), so swapping
the hardcoded data for API calls shouldn't change what's on screen.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///qompify.db` | Any SQLAlchemy URL — e.g. a hosted database |
| `CORS_ORIGINS` | `*` | Comma-separated frontend origins allowed to call the API |
| `AUTO_SEED` | `1` | Create and fill an empty database on startup |

To use a hosted database, install its driver and set the URL:

```bash
pip install "psycopg[binary]"   # PostgreSQL
export DATABASE_URL="postgresql+psycopg://user:password@host:5432/qompify"
```

The schema and queries use only portable SQLAlchemy features, but this demo has only been tested
on SQLite.

**Deploying:** any host that runs Python works (Render, Railway, Fly.io, a VPS). Use
`uvicorn app.main:app --host 0.0.0.0 --port $PORT` as the start command. On hosts whose disk
resets between deploys, SQLite simply rebuilds from `data/` on startup; point `DATABASE_URL` at a
hosted database if you need imported prices to persist.

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

30 tests cover every endpoint, the comparison verdicts, search ranking, feed imports (including
malformed prices and unmatched items) and rejection of malicious XML.

## Project layout

```
app/
  main.py              app setup, CORS, /api/health
  config.py            settings from environment variables
  database.py          engine and session
  models.py            SQL tables
  schemas.py           JSON response shapes
  routers/             catalog.py · compare.py · content.py
  services/            products.py (response building) · scoring.py (comparisons)
  ingest/              seed.py (demo database) · feeds.py (shop feed import)
data/
  catalog.json         categories, products, specs, comparisons, articles
  feeds/               one XML product feed per shop
tests/
```

## About the demo data

Products and specs are modelled on real hardware. The shops (on reserved `.example` domains),
prices and the 90-day price history are made up. EANs use the 20–29 prefix, which is reserved for
in-store use, so they can never match a real product's barcode. The API is read-only: there are no
accounts, carts or payments.
