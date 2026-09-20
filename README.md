# ParkScope

A live map of real parking — free, paid, resident, EV and accessible — built
from OpenStreetMap data. Two files, both free to host:

| File | What it is | Where it goes |
| --- | --- | --- |
| `index.html` | The whole app. No build step, no dependencies to install. | GitHub Pages |
| `worker/index.js` | The whole backend. No dependencies, nothing to compile. | Cloudflare Workers (free plan) |

**Nothing is invented.** If OpenStreetMap doesn't record a price, capacity or
opening hours, the app says "Information unavailable" rather than guessing. It
never claims to know how full a car park is, because that data doesn't exist
in the source.

---

## Setup

### 1. Deploy the backend to Cloudflare (about 3 minutes)

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com) (the free plan
   is plenty — no card needed).
2. **Compute (Workers)** → **Create** → **Start with Hello World** → **Deploy**.
3. Open the new Worker → **Edit code**.
4. Delete everything in the editor, paste the entire contents of
   `worker/index.js`, and click **Deploy**.
5. Copy the Worker's address — it looks like
   `https://parkscope.your-name.workers.dev`.

Check it works by opening `https://your-worker-address/api/health` in a
browser. You should see `{"name":"ParkScope API","status":"ok",...}`.

*Prefer the command line?* `cd worker && npx wrangler deploy` does the same
thing using `wrangler.toml`.

### 2. Point the app at your backend

Open `index.html`, find this line near the top of the `<script>` block, and
paste your Worker address between the quotes:

```js
const WORKER_URL = "https://parkscope.YOUR-SUBDOMAIN.workers.dev";
```

Commit and push. That's the only edit you ever need to make.

### 3. Turn on GitHub Pages

Repo **Settings** → **Pages** → **Source: GitHub Actions**. The included
workflow publishes `index.html` on every push, and your site appears at
`https://your-username.github.io/your-repo/`.

### Running it locally

No tooling required — open `index.html` in a browser. To try a backend without
editing the file, append `?api=https://your-worker.workers.dev` to the address.

---

## How it stays inside the free tiers

Public OpenStreetMap services will throttle anything that hammers them, and
this is the part of the design that stops that happening. Five layers, each
one catching what the previous one missed:

1. **A fixed grid.** The map is carved into ~2km cells and the app may only
   request whole cells — never arbitrary boxes. Two people looking at the same
   street generate the *identical* URL, so they share a cache entry. With
   free-form bounding boxes every pixel of panning would be a cache miss.
2. **The browser cache.** Responses carry a 24-hour `Cache-Control`, so
   revisiting an area costs nothing at all.
3. **Cloudflare's edge cache**, shared by every visitor worldwide. OpenStreetMap
   sees roughly *one* request per cell per day no matter how many people use
   the app.
4. **Request coalescing and mirror failover** in the Worker: simultaneous
   identical requests become one upstream fetch, and three Overpass mirrors are
   tried in turn.
5. **Failures are cached briefly** (2 minutes) so an outage can't turn into a
   retry storm, and the app refuses to fetch at all below zoom 13, where the
   area would be enormous.

Filtering and the "Find parking" ranking both run in the browser on data
that's already loaded, so they cost zero requests.

A realistic day of personal use lands in the low hundreds of Worker requests —
against a free allowance of 100,000 per day.

---

## What's in the app

- **Colour-coded parking** — free, paid, resident/permit, customers-only,
  private, no-parking, and unconfirmed. Every status has its own **icon as well
  as its own colour**, so it's readable if you're colour-blind.
- **On-street parking as bays** drawn along the correct side of the road, taken
  from OpenStreetMap's `parking:lane` tags. Streets with parking on both sides
  get two rows.
- **Car park footprints** where they're mapped as shapes, with a pin at the
  centre.
- **EV and accessible badges** on the pins that have them.
- **Search** for any place, street or landmark.
- **Find parking** — ranks what's on screen by distance, price, opening hours
  and restrictions, and tells you *why* each result ranked where it did.
- **Details panel** with type, access, price, hours (including whether it's
  open right now), max stay, capacity, and a navigation hand-off.
- Works on phones.

### Tuning

Both files have a short configuration block at the top. The useful knobs:

| Where | Setting | Meaning |
| --- | --- | --- |
| `index.html` | `WORKER_URL` | Your backend address |
| `index.html` | `MIN_ZOOM` | Below this, nothing is fetched (default 13) |
| `index.html` | `START` | Opening location — defaults to Prague |
| `worker/index.js` | `CACHE_TTL_SECONDS` | How long a cell stays cached (default 24h) |
| `worker/index.js` | `OVERPASS_MIRRORS` | Which servers to use, in order |

`GRID_DEG` appears in both files and **must match**, or the cache keys stop
lining up.

URL parameters are handy for testing without editing anything:
`?api=`, `?style=`, `?lat=`, `?lon=`, `?z=`.

---

## Attribution and fair use

Parking data is © OpenStreetMap contributors, available under the
[Open Database License](https://www.openstreetmap.org/copyright). Map tiles come
from [OpenFreeMap](https://openfreemap.org); search uses
[Nominatim](https://nominatim.openstreetmap.org). All three are volunteer-funded
public services — the caching described above isn't just about your free tier,
it's about not being a burden on them. Put a real contact address in the
Worker's `CONTACT` variable before you send real traffic, as Nominatim's usage
policy asks.

---

## The earlier version

`frontend/` and `backend/` hold the original build — a React + Vite app with a
Python/FastAPI + PostGIS backend, deployable to Render. It does more (a real
spatial database, a provider architecture ready for TomTom/HERE, bulk imports),
at the cost of needing a database and a server. The two-file version above
replaced it because it's free to run and has nothing to maintain. Delete those
folders whenever you like — the history keeps them.
