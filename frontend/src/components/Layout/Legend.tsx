import { useState } from "react";
import { STATUS_COLOR, STATUS_ICON, STATUS_LABEL, type ParkingStatus } from "../../utils/colors";

const ORDER: ParkingStatus[] = ["free", "paid", "resident", "restricted", "no", "private", "unknown"];

export function Legend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="pointer-events-auto">
      {open && (
        <div className="mb-2 rounded-2xl bg-white/95 backdrop-blur shadow-panel border border-ink-200 p-3.5 w-60">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
            Parking types
          </div>
          <div className="space-y-2">
            {ORDER.map((status) => (
              <div key={status} className="flex items-center gap-2.5 text-xs text-ink-700">
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-white shrink-0 ring-2 ring-white shadow-sm"
                  style={{ backgroundColor: STATUS_COLOR[status] }}
                >
                  {STATUS_ICON[status]}
                </span>
                {STATUS_LABEL[status]}
              </div>
            ))}
            <div className="flex items-center gap-2.5 text-xs text-ink-700 pt-2 border-t border-ink-100">
              <span className="flex gap-1 shrink-0">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-park-ev text-white text-[10px] ring-2 ring-white shadow-sm">
                  ⚡
                </span>
              </span>
              Badge: EV charging
            </div>
            <div className="flex items-center gap-2.5 text-xs text-ink-700">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-park-paid text-white text-[10px] ring-2 ring-white shadow-sm shrink-0">
                ♿
              </span>
              Badge: accessible spaces
            </div>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-10 h-10 rounded-full bg-white shadow-panel border border-ink-200 flex items-center justify-center text-ink-700 hover:bg-ink-50"
        aria-label="Toggle legend"
      >
        🛈
      </button>
    </div>
  );
}
