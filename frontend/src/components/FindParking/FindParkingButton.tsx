import { useEffect, useRef } from "react";
import { findParking } from "../../api/client";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useAppStore } from "../../store/useAppStore";

const SEARCH_RADIUS_M = 800;

export function FindParkingButton() {
  const destination = useAppStore((s) => s.destination);
  const userLocation = useAppStore((s) => s.userLocation);
  const setUserLocation = useAppStore((s) => s.setUserLocation);
  const filters = useAppStore((s) => s.filters);
  const setResults = useAppStore((s) => s.setFindParkingResults);
  const setLoading = useAppStore((s) => s.setFindParkingLoading);
  const setOpen = useAppStore((s) => s.setFindParkingOpen);
  const loading = useAppStore((s) => s.isFindParkingLoading);
  const geo = useGeolocation();
  const awaitingGeoSearchRef = useRef(false);

  async function runSearch(lat: number, lon: number) {
    setLoading(true);
    setOpen(true);
    try {
      const response = await findParking(lat, lon, SEARCH_RADIUS_M, filters);
      setResults(response);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  function handleClick() {
    if (destination) {
      runSearch(destination.latitude, destination.longitude);
    } else if (userLocation) {
      runSearch(userLocation[1], userLocation[0]);
    } else {
      awaitingGeoSearchRef.current = true;
      geo.request();
    }
  }

  // Once geolocation resolves (triggered by the click above), fire the search.
  useEffect(() => {
    if (geo.location && awaitingGeoSearchRef.current) {
      awaitingGeoSearchRef.current = false;
      setUserLocation(geo.location);
      runSearch(geo.location[1], geo.location[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.location]);

  return (
    <button
      onClick={handleClick}
      disabled={loading || geo.loading}
      className="pointer-events-auto flex items-center gap-2 rounded-full bg-ink-900 text-white font-medium pl-4 pr-5 py-3.5 shadow-panel hover:bg-ink-700 transition-colors disabled:opacity-60"
    >
      <span className="text-lg leading-none">🅿️</span>
      {loading || geo.loading ? "Searching…" : "Find Parking"}
    </button>
  );
}
