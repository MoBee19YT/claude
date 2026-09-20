/**
 * ParkScope backend - a single-file Cloudflare Worker. No dependencies, no
 * build step: paste this whole file into the Cloudflare dashboard editor, or
 * deploy it with `wrangler deploy`.
 *
 * WHAT IT DOES
 *   GET /api/health            - liveness + config sanity
 *   GET /api/parking?cell=X_Y  - parking inside one fixed grid cell, as GeoJSON
 *   GET /api/search?q=...      - place search (proxied to Nominatim)
 *
 * WHY IT'S SHAPED LIKE THIS (staying inside free limits, and not getting
 * blocked by OpenStreetMap's servers):
 *
 *   1. The map is carved into a FIXED grid (GRID_DEG). Clients may only ask
 *      for whole cells, never arbitrary boxes. Two users looking at the same
 *      street therefore produce the exact same URL - and so share a cache
 *      entry. Arbitrary bboxes would make every pixel of panning a cache miss.
 *   2. Responses carry a long Cache-Control, so each visitor's own BROWSER
 *      stops re-asking entirely.
 *   3. Each cell is stored in Cloudflare's edge cache, which is shared by
 *      every visitor worldwide. Overpass therefore sees roughly one request
 *      per cell per CACHE_TTL_SECONDS, no matter how popular the app gets.
 *   4. Identical requests arriving together are coalesced into one upstream
 *      fetch (see inflight).
 *   5. If Overpass errors or rate-limits us, we serve the stale copy when we
 *      have one, and otherwise cache the empty result briefly - so a failure
 *      can never turn into a retry storm.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Grid cell size in degrees (~2.2km tall; narrower east-west further north). */
export const GRID_DEG = 0.02;

/** How long a successful cell stays cached, at the edge and in the browser. */
const CACHE_TTL_SECONDS = 86400; // 24h - OSM parking changes slowly
/** Browsers may keep showing a stale cell this long while revalidating. */
const STALE_TTL_SECONDS = 604800; // 7d
/** A failed lookup is cached briefly so errors don't become retry storms. */
const ERROR_TTL_SECONDS = 120;

/** Tried in order; the next one is used if a mirror errors or rate-limits. */
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/** Sent to OSM services so they can identify (and contact) us - required by
 * the Nominatim usage policy. Override with the CONTACT env var. */
const DEFAULT_CONTACT = "parkscope (https://github.com/MoBee19YT/claude)";

const OVERPASS_TIMEOUT_SECONDS = 20;
const UPSTREAM_ABORT_MS = 25000;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return corsPreflight();
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "Only GET is supported" }, 405);
    }

    try {
      switch (url.pathname) {
        case "/":
        case "/api":
        case "/api/health":
          return json({
            name: "ParkScope API",
            status: "ok",
            grid_deg: GRID_DEG,
            cache_ttl_seconds: CACHE_TTL_SECONDS,
            attribution: "© OpenStreetMap contributors",
            endpoints: ["/api/parking?cell=X_Y", "/api/search?q=..."],
          });
        case "/api/parking":
          return await handleParking(url, env, ctx);
        case "/api/search":
          return await handleSearch(url, env, ctx);
        default:
          return json({ error: "Not found", path: url.pathname }, 404);
      }
    } catch (err) {
      return json({ error: "Unhandled error", detail: String(err && err.message || err) }, 500);
    }
  },
};

// ---------------------------------------------------------------------------
// /api/parking
// ---------------------------------------------------------------------------

/** Coalesces concurrent identical lookups within this isolate into one fetch. */
const inflight = new Map();

async function handleParking(url, env, ctx) {
  const cellParam = url.searchParams.get("cell") || "";
  const cell = parseCell(cellParam);
  if (!cell) {
    return json({ error: "cell must look like '721_2504' (integers x_y)" }, 400);
  }

  const cache = caches.default;
  // Cache key is normalised to exactly the cell id, so stray query params
  // (cache-busters, tracking junk) can never fragment the cache.
  const cacheKey = new Request(`${url.origin}/api/parking?cell=${cell.x}_${cell.y}`, {
    method: "GET",
  });

  const cached = await cache.match(cacheKey);
  if (cached) return withCors(cached);

  const key = `${cell.x}_${cell.y}`;
  if (inflight.has(key)) return withCors(await inflight.get(key));

  const work = (async () => {
    const bbox = cellBBox(cell.x, cell.y);
    const contact = (env && env.CONTACT) || DEFAULT_CONTACT;

    let elements = null;
    let error = null;
    for (const mirror of OVERPASS_MIRRORS) {
      try {
        elements = await fetchOverpass(mirror, bbox, contact);
        error = null;
        break;
      } catch (err) {
        error = String((err && err.message) || err);
        // try the next mirror
      }
    }

    if (elements === null) {
      // Cache the failure briefly: enough to stop a pan from retrying every
      // few hundred milliseconds, short enough to recover quickly.
      const body = emptyCollection(cell, { error: error || "upstream unavailable" });
      return cacheable(body, ERROR_TTL_SECONDS, 0);
    }

    const features = [];
    for (const element of elements) {
      const feature = normalizeElement(element);
      if (feature) features.push(feature);
    }

    const body = {
      type: "FeatureCollection",
      features,
      meta: {
        cell: `${cell.x}_${cell.y}`,
        bbox,
        count: features.length,
        attribution: "© OpenStreetMap contributors",
        generated_at: new Date().toISOString(),
      },
    };
    return cacheable(body, CACHE_TTL_SECONDS, STALE_TTL_SECONDS);
  })();

  inflight.set(key, work);
  let response;
  try {
    response = await work;
  } finally {
    inflight.delete(key);
  }

  // Only successful lookups are worth keeping at the edge for a day; the
  // short-TTL error responses are stored too (that's the point), so just
  // honour whatever TTL the body chose.
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return withCors(response);
}

async function fetchOverpass(mirror, bbox, contact) {
  const query = overpassQuery(bbox);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_ABORT_MS);
  try {
    const response = await fetch(mirror, {
      method: "POST",
      body: new URLSearchParams({ data: query }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": contact,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${mirror} returned ${response.status}`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.elements)) throw new Error("malformed Overpass response");
    return payload.elements;
  } finally {
    clearTimeout(timer);
  }
}

function overpassQuery([minLon, minLat, maxLon, maxLat]) {
  // Overpass wants south,west,north,east.
  const b = `${minLat},${minLon},${maxLat},${maxLon}`;
  return `[out:json][timeout:${OVERPASS_TIMEOUT_SECONDS}];
(
  nwr["amenity"="parking"](${b});
  nwr["amenity"="parking_space"](${b});
  way["parking:lane:both"](${b});
  way["parking:lane:left"](${b});
  way["parking:lane:right"](${b});
  way["parking:both"](${b});
  way["parking:left"](${b});
  way["parking:right"](${b});
);
out body geom;`;
}

// ---------------------------------------------------------------------------
// OSM -> normalized parking model
//
// Every field comes from an explicit tag. When OpenStreetMap doesn't say, the
// field stays null and the UI shows "Information unavailable" - nothing here
// is ever guessed or invented.
// ---------------------------------------------------------------------------

export function normalizeElement(element) {
  const tags = element.tags || {};
  const geometry = buildGeometry(element);
  if (!geometry) return null;

  const amenity = tags.amenity;
  const isAmenityParking = amenity === "parking" || amenity === "parking_space";
  const street = !isAmenityParking ? parseStreetParking(tags) : null;
  if (!isAmenityParking && !street) return null;

  const props = isAmenityParking ? parseAmenityParking(tags) : street;

  props.id = `${element.type}/${element.id}`;
  props.source = "openstreetmap";
  props.name = tags.name || null;
  props.address = buildAddress(tags);
  props.status = statusFor(props);
  props.raw_tag_count = Object.keys(tags).length;

  return { type: "Feature", id: props.id, geometry, properties: props };
}

function parseAmenityParking(tags) {
  const kind = tags.parking || "surface";
  let parking_type;
  if (tags.amenity === "parking_space") parking_type = "space";
  else if (kind === "multi-storey" || kind === "underground" || kind === "rooftop") parking_type = "garage";
  else parking_type = "lot";

  const accessTag = tags.access || null;
  const fee = tags.fee === "yes" ? true : tags.fee === "no" ? false : null;

  const { price, currency, period } = parseCharge(tags.charge || tags["fee:conditional"] || "");

  // `covered` is inferred from the structure type when there's no explicit
  // tag - an underground or multi-storey car park is enclosed by definition.
  let covered = null;
  if (tags.covered === "yes") covered = true;
  else if (tags.covered === "no") covered = false;
  else if (kind === "underground" || kind === "multi-storey") covered = true;
  else if (kind === "surface") covered = false;

  let accessible = null;
  if (tags.wheelchair === "yes" || tags.wheelchair === "limited") accessible = true;
  else if (tags.wheelchair === "no") accessible = false;
  else if (toInt(tags["capacity:disabled"])) accessible = true;

  // Absence of a charging tag doesn't prove there's no charger, so this is
  // only ever set to true, never to false.
  const ev = hasChargingTag(tags) ? true : null;

  let resident_only = null;
  if (accessTag === "residents" || accessTag === "permit") resident_only = true;
  else if (accessTag === "public" || accessTag === "yes" || accessTag === "customers" || accessTag === "private")
    resident_only = false;

  return {
    parking_type,
    access: accessTag,
    street_side: null,
    fee,
    price,
    currency,
    price_period: period,
    capacity: toInt(tags.capacity),
    capacity_disabled: toInt(tags["capacity:disabled"]),
    opening_hours: tags.opening_hours || null,
    max_stay: tags.maxstay || null,
    resident_only,
    ev,
    accessible,
    covered,
  };
}

const CONDITION_MAP = {
  free: { access: null, fee: false },
  ticket: { access: null, fee: true },
  disc: { access: null, fee: false },
  residents: { access: "residents", fee: null },
  customers: { access: "customers", fee: null },
  private: { access: "private", fee: null },
  no_parking: { access: "no", fee: null },
  no_stopping: { access: "no", fee: null },
};

const NO_LANE_VALUES = new Set(["no", "none", "separate"]);

function parseStreetParking(tags) {
  const laneValue = (side) => tags[`parking:lane:${side}`] || tags[`parking:${side}`] || null;
  const usable = (side) => {
    const v = laneValue(side);
    return v && !NO_LANE_VALUES.has(v);
  };

  let street_side = null;
  if (usable("both")) street_side = "both";
  else if (usable("left") && usable("right")) street_side = "both";
  else if (usable("left")) street_side = "left";
  else if (usable("right")) street_side = "right";

  const condition =
    tags["parking:condition:both"] || tags["parking:condition:left"] || tags["parking:condition:right"] || "";

  // Nothing usable and no condition worth showing -> not a parking feature.
  if (!street_side && !condition) return null;

  const mapped = CONDITION_MAP[condition] || { access: null, fee: null };

  return {
    parking_type: "street",
    access: mapped.access,
    street_side,
    fee: mapped.fee,
    price: null,
    currency: null,
    price_period: null,
    capacity: null,
    capacity_disabled: null,
    opening_hours: tags.opening_hours || null,
    max_stay: tags.maxstay || null,
    resident_only: mapped.access === "residents" ? true : null,
    ev: null,
    accessible: null,
    covered: false,
  };
}

/**
 * Which colour/icon a feature gets. Restriction beats pricing, and anything
 * known beats "unknown" - the UI and the legend both read this one field, so
 * they can never disagree about what a marker means.
 */
export function statusFor(p) {
  if (p.access === "no") return "no";
  if (p.access === "private") return "private";
  if (p.resident_only === true || p.access === "residents" || p.access === "permit") return "resident";
  if (p.access === "customers") return "restricted";
  if (p.fee === true) return "paid";
  if (p.fee === false) return "free";
  return "unknown";
}

const CURRENCY_SYMBOLS = { "Kč": "CZK", "€": "EUR", $: "USD", "£": "GBP" };

export function parseCharge(value) {
  const empty = { price: null, currency: null, period: null };
  if (!value) return empty;
  const match = /(\d+(?:[.,]\d+)?)\s*([A-Za-z]{3}|Kč|€|\$|£)?\s*(?:\/\s*(\d*\s*[A-Za-z]+))?/.exec(value);
  if (!match) return empty;
  const price = Number(match[1].replace(",", "."));
  if (!Number.isFinite(price)) return empty;
  let currency = match[2] || null;
  if (currency) currency = CURRENCY_SYMBOLS[currency] || currency.toUpperCase();
  return { price, currency, period: match[3] ? match[3].trim().toLowerCase() : null };
}

function hasChargingTag(tags) {
  if (tags.amenity === "charging_station") return true;
  for (const key of Object.keys(tags)) {
    if (key.indexOf("charging") !== -1 || key.indexOf("socket:") === 0) return true;
  }
  return false;
}

function buildAddress(tags) {
  if (!tags["addr:street"]) return null;
  return tags["addr:housenumber"] ? `${tags["addr:street"]} ${tags["addr:housenumber"]}` : tags["addr:street"];
}

function buildGeometry(element) {
  if (element.type === "node") {
    if (typeof element.lat !== "number" || typeof element.lon !== "number") return null;
    return { type: "Point", coordinates: [element.lon, element.lat] };
  }

  if (element.type === "way") {
    const coords = coordsOf(element.geometry);
    if (coords.length < 2) return null;
    return isClosed(coords) ? { type: "Polygon", coordinates: [coords] } : { type: "LineString", coordinates: coords };
  }

  if (element.type === "relation") {
    // Best effort: the largest closed outer ring, else a point at the middle
    // of everything we saw. Multipolygon assembly isn't worth the CPU budget
    // of a free-tier Worker.
    let best = null;
    let all = [];
    for (const member of element.members || []) {
      if (member.type !== "way") continue;
      const coords = coordsOf(member.geometry);
      if (!coords.length) continue;
      all = all.concat(coords);
      if (isClosed(coords) && (!best || coords.length > best.length)) best = coords;
    }
    if (best) return { type: "Polygon", coordinates: [best] };
    if (!all.length) return null;
    let lon = 0;
    let lat = 0;
    for (const c of all) {
      lon += c[0];
      lat += c[1];
    }
    return { type: "Point", coordinates: [lon / all.length, lat / all.length] };
  }

  return null;
}

function coordsOf(geometry) {
  if (!Array.isArray(geometry)) return [];
  const coords = [];
  for (const node of geometry) {
    if (node && typeof node.lon === "number" && typeof node.lat === "number") coords.push([node.lon, node.lat]);
  }
  return coords;
}

function isClosed(coords) {
  if (coords.length < 4) return false;
  const a = coords[0];
  const b = coords[coords.length - 1];
  return a[0] === b[0] && a[1] === b[1];
}

function toInt(value) {
  if (value === undefined || value === null) return null;
  const n = parseInt(String(value).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// /api/search  (Nominatim proxy)
// ---------------------------------------------------------------------------

async function handleSearch(url, env, ctx) {
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 3) return json({ results: [] });

  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/api/search?q=${encodeURIComponent(q.toLowerCase())}`, {
    method: "GET",
  });
  const cached = await cache.match(cacheKey);
  if (cached) return withCors(cached);

  const contact = (env && env.CONTACT) || DEFAULT_CONTACT;
  const target = `${NOMINATIM_URL}?${new URLSearchParams({
    q,
    format: "jsonv2",
    limit: "6",
    addressdetails: "1",
  })}`;

  let results = [];
  let error = null;
  try {
    const response = await fetch(target, {
      headers: { "User-Agent": contact, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);
    const payload = await response.json();
    results = (Array.isArray(payload) ? payload : [])
      .map((item) => {
        const lat = Number(item.lat);
        const lon = Number(item.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return {
          label: item.display_name || q,
          type: item.type || null,
          lat,
          lon,
        };
      })
      .filter(Boolean);
  } catch (err) {
    error = String((err && err.message) || err);
  }

  const response = cacheable({ results, error }, error ? ERROR_TTL_SECONDS : CACHE_TTL_SECONDS, 0);
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return withCors(response);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseCell(value) {
  const match = /^(-?\d{1,6})_(-?\d{1,6})$/.exec(value);
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  // Guard against nonsense coordinates that would produce an invalid bbox.
  if (Math.abs(x * GRID_DEG) > 180 || Math.abs(y * GRID_DEG) > 90) return null;
  return { x, y };
}

export function cellBBox(x, y) {
  return [
    round6(x * GRID_DEG),
    round6(y * GRID_DEG),
    round6((x + 1) * GRID_DEG),
    round6((y + 1) * GRID_DEG),
  ];
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

function emptyCollection(cell, meta) {
  return {
    type: "FeatureCollection",
    features: [],
    meta: Object.assign({ cell: `${cell.x}_${cell.y}`, count: 0, attribution: "© OpenStreetMap contributors" }, meta),
  };
}

function cacheable(body, maxAge, staleWhileRevalidate) {
  const directives = [`public`, `max-age=${maxAge}`, `s-maxage=${maxAge}`];
  if (staleWhileRevalidate) directives.push(`stale-while-revalidate=${staleWhileRevalidate}`);
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": directives.join(", "),
    },
  });
}

function json(body, status = 200) {
  return withCors(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    }),
  );
}

function withCors(response) {
  const out = new Response(response.body, response);
  out.headers.set("Access-Control-Allow-Origin", "*");
  out.headers.set("Vary", "Origin");
  return out;
}

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
