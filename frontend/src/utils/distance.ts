export function formatDistance(meters: number | null | undefined): string {
  if (meters == null) return "Distance unavailable";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatWalkTime(meters: number | null | undefined): string | null {
  if (meters == null) return null;
  const walkingSpeedMPerMin = 80; // ~4.8 km/h, a comfortable walking pace
  const minutes = Math.max(1, Math.round(meters / walkingSpeedMPerMin));
  return `${minutes} min walk`;
}

export function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function formatPrice(price: number | null, currency: string | null, period: string | null): string {
  if (price == null) return "Price information unavailable";
  const amount = currency ? `${price} ${currency}` : `${price}`;
  return period ? `${amount} / ${period}` : amount;
}
