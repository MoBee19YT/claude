import { useState } from "react";
import { STATUS_COLOR, STATUS_ICON, STATUS_LABEL, type ParkingStatus } from "../../utils/colors";

const ORDER: ParkingStatus[] = ["free", "paid", "resident", "restricted", "no", "private", "unknown"];

export function Legend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="pointer-events-auto">
      {open && (
        <div className="mb-2 rounded-2xl bg-white/95 backdrop-blur shadow-panel border border-ink-200 p-3 w-56">
          <div className="space-y-1.5">
            {ORDER.map((status) => (
              <div key={status} className="flex items-center gap-2 text-xs text-ink-700">
                <span
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold text-white shrink-0"
                  style={{ backgroundColor: STATUS_COLOR[status] }}
                >
                  {STATUS_ICON[status]}
                </span>
                {STATUS_LABEL[status]}
              </div>
            ))}
            <div className="flex items-center gap-2 text-xs text-ink-700 pt-1 border-t border-ink-100 mt-1.5">
              <span className="text-xs">⚡ / ♿</span>
              EV charging / accessible (badge)
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
