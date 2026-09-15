/**
 * Basemap: OpenFreeMap (https://openfreemap.org), a free, keyless vector
 * tile service built on OpenStreetMap data. No API key, no billing, no
 * rate limit to configure - matches the "prefer free/open data" and "no
 * hardcoded keys" requirements for the base map itself (parking data is
 * a separate layer we add on top, see ParkingMap.tsx).
 */
export const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export const DEFAULT_CENTER: [number, number] = [
  Number(import.meta.env.VITE_DEFAULT_LON) || 14.4378,
  Number(import.meta.env.VITE_DEFAULT_LAT) || 50.0755,
];
export const DEFAULT_ZOOM = Number(import.meta.env.VITE_DEFAULT_ZOOM) || 14;
export const DEFAULT_PITCH = 45;
