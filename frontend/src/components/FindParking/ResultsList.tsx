import type { FindParkingResult } from "../../api/types";
import { useAppStore } from "../../store/useAppStore";
import { getParkingStatus, STATUS_COLOR, STATUS_ICON } from "../../utils/colors";

function ResultCard({ result }: { result: FindParkingResult }) {
  const selectParking = useAppStore((s) => s.selectParking);
  const setOpen = useAppStore((s) => s.setFindParkingOpen);
  const p = result.feature.properties;
  const status = getParkingStatus(p);

  return (
    <button
      onClick={() => {
        selectParking(p.id);
        setOpen(false);
      }}
      className="w-full text-left rounded-2xl border border-ink-100 hover:border-ink-900/20 hover:shadow-panel transition-all p-4 bg-white"
    >
      {result.best_match && (
        <div className="text-[11px] font-bold tracking-wide text-park-free mb-1.5">BEST MATCH</div>
      )}
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold text-white shrink-0"
          style={{ backgroundColor: STATUS_COLOR[status] }}
        >
          {STATUS_ICON[status]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink-900 truncate">{p.name || "Parking"}</div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-sm text-slate-500 mt-0.5">
            {result.reasons.map((reason, i) => (
              <span key={i}>
                {reason}
                {i < result.reasons.length - 1 && " ·"}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

export function ResultsList() {
  const isOpen = useAppStore((s) => s.isFindParkingOpen);
  const setOpen = useAppStore((s) => s.setFindParkingOpen);
  const results = useAppStore((s) => s.findParkingResults);
  const loading = useAppStore((s) => s.isFindParkingLoading);

  if (!isOpen) return null;

  return (
    <div className="pointer-events-auto w-full sm:w-96 max-h-[70vh] sm:max-h-[calc(100vh-2rem)] overflow-y-auto rounded-t-xl2 sm:rounded-xl2 bg-white shadow-panel border border-ink-200">
      <div className="sticky top-0 bg-white/95 backdrop-blur px-5 pt-4 pb-3 border-b border-ink-100 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink-900">Parking near you</h2>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-ink-100"
        >
          ✕
        </button>
      </div>
      <div className="p-4 space-y-3">
        {loading && <div className="text-sm text-slate-400 px-1 py-2">Finding the best parking nearby…</div>}
        {!loading && results && results.results.length === 0 && (
          <div className="text-sm text-slate-400 px-1 py-2">No parking found nearby. Try widening your filters.</div>
        )}
        {!loading && results?.results.map((r) => <ResultCard key={r.feature.properties.id} result={r} />)}
      </div>
    </div>
  );
}
