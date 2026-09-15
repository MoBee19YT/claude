import type {
  FindParkingResponse,
  ParkingFeature,
  ParkingFeatureCollection,
  ParkingFilterState,
  ProvidersMeta,
  SearchResult,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

function filtersToParams(filters: ParkingFilterState, params: URLSearchParams): void {
  filters.types.forEach((t) => params.append("type", t));
  if (filters.free) params.set("free", "true");
  if (filters.paid) params.set("paid", "true");
  if (filters.resident) params.set("resident", "true");
  if (filters.private) params.set("private", "true");
  if (filters.ev) params.set("ev", "true");
  if (filters.accessible) params.set("accessible", "true");
  if (filters.covered) params.set("covered", "true");
  if (filters.availabilityKnown) params.set("availability_known", "true");
  if (filters.openNow) params.set("open_now", "true");
  if (filters.maxPrice != null) params.set("max_price", String(filters.maxPrice));
  if (filters.maxWalkDistanceM != null) params.set("max_walk_distance_m", String(filters.maxWalkDistanceM));
}

async function getJSON<T>(path: string, params: URLSearchParams): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}?${params.toString()}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  return response.json() as Promise<T>;
}

export type BBox = [number, number, number, number]; // min_lon, min_lat, max_lon, max_lat

export async function fetchParking(
  bbox: BBox,
  zoom: number,
  filters: ParkingFilterState,
  refPoint?: [number, number],
): Promise<ParkingFeatureCollection> {
  const params = new URLSearchParams();
  params.set("bbox", bbox.join(","));
  params.set("zoom", String(zoom));
  if (refPoint) {
    params.set("ref_lon", String(refPoint[0]));
    params.set("ref_lat", String(refPoint[1]));
  }
  filtersToParams(filters, params);
  return getJSON<ParkingFeatureCollection>("/parking", params);
}

export async function fetchParkingById(id: string): Promise<ParkingFeature> {
  return getJSON<ParkingFeature>(`/parking/${id}`, new URLSearchParams());
}

export async function findParking(
  lat: number,
  lon: number,
  radiusM: number,
  filters: ParkingFilterState,
): Promise<FindParkingResponse> {
  const params = new URLSearchParams();
  params.set("lat", String(lat));
  params.set("lon", String(lon));
  params.set("radius_m", String(radiusM));
  filtersToParams(filters, params);
  return getJSON<FindParkingResponse>("/find-parking", params);
}

export async function searchPlaces(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams();
  params.set("q", query);
  return getJSON<SearchResult[]>("/search", params);
}

export async function fetchProviders(): Promise<ProvidersMeta> {
  return getJSON<ProvidersMeta>("/meta/providers", new URLSearchParams());
}
