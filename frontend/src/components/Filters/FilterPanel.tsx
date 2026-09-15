import type { ParkingType } from "../../api/types";
import { useAppStore } from "../../store/useAppStore";

const TYPE_OPTIONS: { value: ParkingType; label: string }[] = [
  { value: "lot", label: "Parking lot" },
  { value: "garage", label: "Parking garage" },
  { value: "street", label: "Street parking" },
  { value: "space", label: "Parking space" },
];

const TOGGLE_OPTIONS: { key: "free" | "paid" | "resident" | "private" | "ev" | "accessible" | "covered" | "availabilityKnown" | "openNow"; label: string }[] = [
  { key: "free", label: "Free" },
  { key: "paid", label: "Paid" },
  { key: "resident", label: "Resident only" },
  { key: "private", label: "Private" },
  { key: "ev", label: "EV charging" },
  { key: "accessible", label: "Accessible" },
  { key: "covered", label: "Covered" },
  { key: "availabilityKnown", label: "Availability known" },
  { key: "openNow", label: "Open now" },
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-colors ${
        active
          ? "bg-ink-900 text-white border-ink-900"
          : "bg-white text-ink-700 border-ink-200 hover:border-ink-900/30"
      }`}
    >
      {children}
    </button>
  );
}

export function FilterPanel() {
  const isOpen = useAppStore((s) => s.isFilterPanelOpen);
  const setOpen = useAppStore((s) => s.setFilterPanelOpen);
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const resetFilters = useAppStore((s) => s.resetFilters);

  if (!isOpen) return null;

  function toggleType(type: ParkingType) {
    const types = filters.types.includes(type) ? filters.types.filter((t) => t !== type) : [...filters.types, type];
    setFilters({ types });
  }

  const activeCount =
    filters.types.length +
    TOGGLE_OPTIONS.filter((o) => filters[o.key]).length +
    (filters.maxPrice != null ? 1 : 0) +
    (filters.maxWalkDistanceM != null ? 1 : 0);

  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-ink-900/30 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div
        className="w-full sm:w-[28rem] max-h-[85vh] overflow-y-auto rounded-t-xl2 sm:rounded-xl2 bg-white shadow-panel p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-ink-900">Filters</h2>
          <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-ink-100">
            ✕
          </button>
        </div>

        <section className="mb-5">
          <h3 className="text-xs uppercase tracking-wide text-slate-400 mb-2">Type</h3>
          <div className="flex flex-wrap gap-2">
            {TYPE_OPTIONS.map((opt) => (
              <Chip key={opt.value} active={filters.types.includes(opt.value)} onClick={() => toggleType(opt.value)}>
                {opt.label}
              </Chip>
            ))}
          </div>
        </section>

        <section className="mb-5">
          <h3 className="text-xs uppercase tracking-wide text-slate-400 mb-2">Access & amenities</h3>
          <div className="flex flex-wrap gap-2">
            {TOGGLE_OPTIONS.map((opt) => (
              <Chip key={opt.key} active={filters[opt.key]} onClick={() => setFilters({ [opt.key]: !filters[opt.key] })}>
                {opt.label}
              </Chip>
            ))}
          </div>
        </section>

        <section className="mb-5 grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-slate-400">Max price</span>
            <input
              type="number"
              min={0}
              value={filters.maxPrice ?? ""}
              onChange={(e) => setFilters({ maxPrice: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="Any"
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-ink-900"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-slate-400">Max walk (m)</span>
            <input
              type="number"
              min={0}
              value={filters.maxWalkDistanceM ?? ""}
              onChange={(e) => setFilters({ maxWalkDistanceM: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="Any"
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-ink-900"
            />
          </label>
        </section>

        <div className="flex items-center justify-between pt-2 border-t border-ink-100">
          <button onClick={resetFilters} disabled={activeCount === 0} className="text-sm text-slate-500 disabled:opacity-40">
            Reset all
          </button>
          <button onClick={() => setOpen(false)} className="rounded-full bg-ink-900 text-white text-sm font-medium px-5 py-2.5">
            Show results
          </button>
        </div>
      </div>
    </div>
  );
}
