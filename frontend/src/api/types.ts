/**
 * Mirrors backend/app/schemas/parking.py. Keep these two in sync by hand -
 * this is a small enough MVP that generating a client from the OpenAPI
 * schema would be more ceremony than it's worth, but /docs on the backend
 * is the source of truth if these ever drift.
 */

export type ParkingType = "lot" | "garage" | "street" | "space" | "unknown";
export type AccessType = "public" | "private" | "customers" | "permit" | "residents" | "no" | "unknown";
export type AvailabilityType = "realtime" | "predicted" | "static" | "unknown";

export type GeoJSONGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "LineString"; coordinates: [number, number][] }
  | { type: "Polygon"; coordinates: [number, number][][] };

export interface ParkingProperties {
  id: string;
  sources: string[];
  source_ids: Record<string, string>;

  parking_type: ParkingType;
  access: AccessType | null;

  fee: boolean | null;
  price: number | null;
  price_period: string | null;
  currency: string | null;

  capacity: number | null;
  capacity_disabled: number | null;

  opening_hours: string | null;
  max_stay: string | null;

  resident_only: boolean | null;
  ev: boolean | null;
  accessible: boolean | null;
  covered: boolean | null;

  availability_count: number | null;
  availability_type: AvailabilityType;
  availability_updated: string | null;
  confidence: number | null;

  name: string | null;
  address: string | null;
  country: string | null;
  city: string | null;

  last_updated: string | null;
  is_open_now: boolean | null;
  distance_m: number | null;
}

export interface ParkingFeature {
  type: "Feature";
  geometry: GeoJSONGeometry;
  properties: ParkingProperties;
}

export interface ParkingFeatureMeta {
  count: number;
  attribution: string;
  providers_active: string[];
  providers_available_not_configured: string[];
  truncated: boolean;
}

export interface ParkingFeatureCollection {
  type: "FeatureCollection";
  features: ParkingFeature[];
  meta: ParkingFeatureMeta;
}

export interface FindParkingResult {
  feature: ParkingFeature;
  score: number;
  rank: number;
  best_match: boolean;
  reasons: string[];
}

export interface FindParkingResponse {
  results: FindParkingResult[];
  meta: ParkingFeatureMeta;
}

export interface SearchResult {
  label: string;
  address: string | null;
  latitude: number;
  longitude: number;
  type: string | null;
  bbox: [number, number, number, number] | null;
}

export interface ProviderStatus {
  name: string;
  configured: boolean;
  description: string;
}

export interface ProvidersMeta {
  providers: ProviderStatus[];
}

export interface ParkingFilterState {
  types: ParkingType[];
  free: boolean;
  paid: boolean;
  resident: boolean;
  private: boolean;
  ev: boolean;
  accessible: boolean;
  covered: boolean;
  availabilityKnown: boolean;
  openNow: boolean;
  maxPrice: number | null;
  maxWalkDistanceM: number | null;
}

export const emptyFilters: ParkingFilterState = {
  types: [],
  free: false,
  paid: false,
  resident: false,
  private: false,
  ev: false,
  accessible: false,
  covered: false,
  availabilityKnown: false,
  openNow: false,
  maxPrice: null,
  maxWalkDistanceM: null,
};
