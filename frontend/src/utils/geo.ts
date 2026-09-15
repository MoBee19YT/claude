import type { GeoJSONGeometry } from "../api/types";

/** Cheap centroid approximation (average of all vertices) - good enough for
 * "open navigation to this facility", not meant for precise area math. */
export function featureCenter(geometry: GeoJSONGeometry): [number, number] {
  if (geometry.type === "Point") return geometry.coordinates;

  const points: [number, number][] =
    geometry.type === "LineString" ? geometry.coordinates : geometry.coordinates[0];

  const [sumLon, sumLat] = points.reduce(
    ([lon, lat], [pLon, pLat]) => [lon + pLon, lat + pLat],
    [0, 0],
  );
  return [sumLon / points.length, sumLat / points.length];
}

export function navigationUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}
