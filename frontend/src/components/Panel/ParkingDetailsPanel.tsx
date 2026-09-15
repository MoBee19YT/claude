import { useEffect, useState } from "react";
import { fetchParkingById } from "../../api/client";
import type { ParkingFeature } from "../../api/types";
import { useAppStore } from "../../store/useAppStore";
import { getParkingStatus, STATUS_COLOR, STATUS_ICON, STATUS_LABEL } from "../../utils/colors";
import { formatDistance, formatPrice, formatWalkTime } from "../../utils/distance";
import { featureCenter, navigationUrl } from "../../utils/geo";

const TYPE_LABEL: Record<string, string> = {
  lot: "Parking lot",
  garage: "Parking garage",
  street: "Street parking",
  space: "Parking space",
  unknown: "Parking",
};

const ACCESS_LABEL: Record<string, string> = {
  public: "Public",
  private: "Private",
  customers: "Customers only",
  permit: "Permit holders only",
  residents: "Residents only",
  no: "No parking",
  unknown: "Information unavailable",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-ink-100 last:border-0">
      <span className="text-xs uppercase tracking-wide text-slate-400 pt-0.5">{label}</span>
      <span className="text-sm text-ink-900 text-right">{value}</span>
    </div>
  );
}

function Unavailable() {
  return <span className="text-slate-400 italic">Information unavailable</span>;
}

function AvailabilitySection({ feature }: { feature: ParkingFeature }) {
  const p = feature.properties;
  if (p.availability_type === "realtime" || p.availability_type === "predicted") {
    if (p.availability_count != null) {
      const pct = p.capacity ? Math.round((p.availability_count / p.capacity) * 100) : null;
      return (
        <div className="rounded-xl bg-park-free/10 text-park-free px-4 py-3 text-sm font-medium">
          {p.availability_type === "predicted" ? "~" : ""}
          {p.availability_count} spaces available{pct != null ? ` (${pct}%)` : ""}
          {p.availability_updated && (
            <div className="text-xs font-normal opacity-80 mt-0.5">
              {p.availability_type === "predicted" ? "Predicted" : "Updated"}{" "}
              {new Date(p.availability_updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>
      );
    }
  }
  if (p.availability_type === "static") {
    return (
      <div className="rounded-xl bg-slate-100 text-slate-500 px-4 py-3 text-sm">
        Static listing only — no live availability from this source.
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-park-unknown/10 text-park-unknown px-4 py-3 text-sm font-medium">
      Availability unknown
    </div>
  );
}

export function ParkingDetailsPanel() {
  const selectedId = useAppStore((s) => s.selectedParkingId);
  const selectParking = useAppStore((s) => s.selectParking);
  const [feature, setFeature] = useState<ParkingFeature | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) {
      setFeature(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetchParkingById(selectedId)
      .then(setFeature)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedId]);

  if (!selectedId) return null;

  const p = feature?.properties;
  const status = p ? getParkingStatus(p) : "unknown";
  const center = feature ? featureCenter(feature.geometry) : null;

  return (
    <div className="pointer-events-auto w-full sm:w-96 max-h-[70vh] sm:max-h-[calc(100vh-2rem)] overflow-y-auto rounded-t-xl2 sm:rounded-xl2 bg-white shadow-panel border border-ink-200 animate-in">
      <div className="sticky top-0 bg-white/95 backdrop-blur px-5 pt-4 pb-3 border-b border-ink-100 flex items-start justify-between gap-3">
        <div>
          {p && (
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white shrink-0"
                style={{ backgroundColor: STATUS_COLOR[status] }}
              >
                {STATUS_ICON[status]}
              </span>
              <span className="text-xs font-medium text-slate-500">{STATUS_LABEL[status]}</span>
            </div>
          )}
          <h2 className="text-lg font-semibold text-ink-900 leading-tight">
            {p?.name || (p ? TYPE_LABEL[p.parking_type] : "Loading…")}
          </h2>
          {p && <p className="text-sm text-slate-400">{p.address || TYPE_LABEL[p.parking_type]}</p>}
        </div>
        <button
          onClick={() => selectParking(null)}
          aria-label="Close"
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-ink-100 hover:text-ink-900"
        >
          ✕
        </button>
      </div>

      <div className="px-5 py-4 space-y-4">
        {loading && <div className="text-sm text-slate-400">Loading details…</div>}
        {error && <div className="text-sm text-red-600">Couldn't load this parking facility: {error}</div>}

        {p && (
          <>
            <AvailabilitySection feature={feature!} />

            <div className="flex flex-wrap gap-2">
              {p.ev && <Badge label="EV charging" />}
              {p.accessible && <Badge label="Accessible" />}
              {p.covered && <Badge label="Covered" />}
              {p.covered === false && <Badge label="Open-air" muted />}
            </div>

            <div>
              <Row label="Type" value={TYPE_LABEL[p.parking_type]} />
              <Row label="Access" value={ACCESS_LABEL[p.access ?? "unknown"]} />
              <Row label="Price" value={p.fee === false ? "Free" : formatPrice(p.price, p.currency, p.price_period)} />
              <Row
                label="Opening hours"
                value={
                  p.opening_hours ? (
                    <span>
                      {p.opening_hours}
                      {p.is_open_now != null && (
                        <span className={p.is_open_now ? "text-park-free font-medium" : "text-park-no font-medium"}>
                          {" "}
                          · {p.is_open_now ? "Open now" : "Closed now"}
                        </span>
                      )}
                    </span>
                  ) : (
                    <Unavailable />
                  )
                }
              />
              <Row label="Max stay" value={p.max_stay ?? <Unavailable />} />
              <Row label="Capacity" value={p.capacity != null ? `${p.capacity} spaces` : <Unavailable />} />
              {p.capacity_disabled != null && <Row label="Accessible spaces" value={p.capacity_disabled} />}
              {p.distance_m != null && (
                <Row
                  label="Walking distance"
                  value={`${formatDistance(p.distance_m)}${formatWalkTime(p.distance_m) ? ` · ${formatWalkTime(p.distance_m)}` : ""}`}
                />
              )}
            </div>

            <div className="pt-1 text-xs text-slate-400 flex items-center justify-between">
              <span>Source: {p.sources.join(", ") || "unknown"}</span>
              {p.last_updated && <span>Updated {new Date(p.last_updated).toLocaleDateString()}</span>}
            </div>

            {center && (
              <a
                href={navigationUrl(center[1], center[0])}
                target="_blank"
                rel="noreferrer"
                className="block w-full text-center rounded-full bg-ink-900 text-white font-medium py-3 hover:bg-ink-700 transition-colors"
              >
                Navigate
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Badge({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <span
      className={`text-xs font-medium px-2.5 py-1 rounded-full ${
        muted ? "bg-slate-100 text-slate-500" : "bg-ink-900/5 text-ink-900"
      }`}
    >
      {label}
    </span>
  );
}
