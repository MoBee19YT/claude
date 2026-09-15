import { useEffect } from "react";
import { useGeolocation } from "../../hooks/useGeolocation";
import { SearchBar } from "../Search/SearchBar";
import { useAppStore } from "../../store/useAppStore";

export function TopBar() {
  const setFilterPanelOpen = useAppStore((s) => s.setFilterPanelOpen);
  const filters = useAppStore((s) => s.filters);
  const setUserLocation = useAppStore((s) => s.setUserLocation);
  const requestFlyTo = useAppStore((s) => s.requestFlyTo);
  const geo = useGeolocation();

  const activeFilterCount =
    filters.types.length +
    [filters.free, filters.paid, filters.resident, filters.private, filters.ev, filters.accessible, filters.covered, filters.availabilityKnown, filters.openNow].filter(Boolean).length +
    (filters.maxPrice != null ? 1 : 0) +
    (filters.maxWalkDistanceM != null ? 1 : 0);

  function locateMe() {
    geo.request();
  }

  useEffect(() => {
    if (geo.location) {
      setUserLocation(geo.location);
      requestFlyTo(geo.location, 16);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.location]);

  return (
    <div className="pointer-events-none absolute top-0 left-0 right-0 p-4 flex items-start gap-2 z-10">
      <div className="pointer-events-auto flex-1 max-w-xl">
        <SearchBar />
      </div>
      <button
        onClick={() => setFilterPanelOpen(true)}
        className="pointer-events-auto relative shrink-0 w-12 h-12 rounded-full bg-white shadow-panel border border-ink-200 flex items-center justify-center text-ink-700 hover:bg-ink-50"
        aria-label="Filters"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {activeFilterCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-park-paid text-white text-[10px] font-bold flex items-center justify-center">
            {activeFilterCount}
          </span>
        )}
      </button>
      <button
        onClick={locateMe}
        disabled={geo.loading}
        className="pointer-events-auto shrink-0 w-12 h-12 rounded-full bg-white shadow-panel border border-ink-200 flex items-center justify-center text-ink-700 hover:bg-ink-50 disabled:opacity-60"
        aria-label="Use my location"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
