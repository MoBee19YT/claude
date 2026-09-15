import type { ParkingProperties } from "../api/types";

/**
 * One consistent color+icon system for parking status, used by both the
 * map layers and the UI chrome (legend, panel, filter chips). Color alone
 * is never the only signal - every color has a fixed icon glyph too, so
 * the app stays usable for colorblind users (see Legend.tsx).
 *
 * Priority order matters: a resident-only paid garage should read as
 * "resident", not "paid" - restriction beats pricing beats the default.
 */
export type ParkingStatus =
  | "no"
  | "private"
  | "resident"
  | "restricted"
  | "paid"
  | "free"
  | "unknown";

export const STATUS_COLOR: Record<ParkingStatus, string> = {
  no: "#dc2626",
  private: "#64748b",
  resident: "#9333ea",
  restricted: "#ea580c",
  paid: "#2563eb",
  free: "#16a34a",
  unknown: "#ca8a04",
};

export const STATUS_ICON: Record<ParkingStatus, string> = {
  no: "✕",
  private: "P",
  resident: "R",
  restricted: "!",
  paid: "$",
  free: "P",
  unknown: "?",
};

export const STATUS_LABEL: Record<ParkingStatus, string> = {
  no: "No parking",
  private: "Private",
  resident: "Resident / permit",
  restricted: "Restricted",
  paid: "Paid parking",
  free: "Free parking",
  unknown: "Uncertain / incomplete",
};

export function getParkingStatus(props: Pick<ParkingProperties, "access" | "resident_only" | "fee">): ParkingStatus {
  if (props.access === "no") return "no";
  if (props.access === "private") return "private";
  if (props.resident_only || props.access === "residents" || props.access === "permit") return "resident";
  if (props.access === "customers") return "restricted";
  if (props.fee === true) return "paid";
  if (props.fee === false) return "free";
  return "unknown";
}

export function getParkingColor(props: Pick<ParkingProperties, "access" | "resident_only" | "fee">): string {
  return STATUS_COLOR[getParkingStatus(props)];
}
