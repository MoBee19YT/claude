import { useState } from "react";
import { ParkingMap } from "./components/Map/ParkingMap";
import { FilterPanel } from "./components/Filters/FilterPanel";
import { FindParkingButton } from "./components/FindParking/FindParkingButton";
import { ResultsList } from "./components/FindParking/ResultsList";
import { Legend } from "./components/Layout/Legend";
import { TopBar } from "./components/Layout/TopBar";
import { ParkingDetailsPanel } from "./components/Panel/ParkingDetailsPanel";
import { useAppStore } from "./store/useAppStore";
import type { ParkingFeatureCollection } from "./api/types";

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<ParkingFeatureCollection["meta"] | null>(null);
  const selectedId = useAppStore((s) => s.selectedParkingId);
  const isFindParkingOpen = useAppStore((s) => s.isFindParkingOpen);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-ink-100">
      <ParkingMap onLoadingChange={setLoading} onErrorChange={setError} onMetaChange={setMeta} />

      <TopBar />
      <FilterPanel />

      <div className="pointer-events-none absolute top-20 left-0 right-0 flex justify-center z-10">
        {loading && (
          <div className="pointer-events-auto rounded-full bg-white/95 backdrop-blur shadow-panel px-4 py-1.5 text-xs font-medium text-slate-500">
            Loading parking data…
          </div>
        )}
        {!loading && error && (
          <div className="pointer-events-auto rounded-full bg-red-50 border border-red-200 shadow-panel px-4 py-1.5 text-xs font-medium text-red-700 max-w-md truncate">
            Couldn't load parking data: {error}
          </div>
        )}
        {!loading && !error && meta?.truncated && (
          <div className="pointer-events-auto rounded-full bg-white/95 backdrop-blur shadow-panel px-4 py-1.5 text-xs font-medium text-slate-500">
            Showing the top {meta.count} results here — zoom in to see more
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute left-4 bottom-4 z-10">
        <Legend />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 sm:bottom-4 sm:right-4 sm:left-auto flex flex-col items-center sm:items-end gap-3 p-4 sm:p-0 z-10">
        {selectedId && <ParkingDetailsPanel />}
        {!selectedId && isFindParkingOpen && <ResultsList />}
        {!selectedId && !isFindParkingOpen && <FindParkingButton />}
      </div>
    </div>
  );
}
