import type { ExpressionSpecification } from "maplibre-gl";
import { STATUS_COLOR } from "../../utils/colors";

export const PARKING_SOURCE_ID = "parking";
export const CLUSTER_LAYER_ID = "parking-clusters";
export const CLUSTER_COUNT_LAYER_ID = "parking-cluster-count";
export const POLYGON_FILL_LAYER_ID = "parking-polygons";
export const POLYGON_OUTLINE_LAYER_ID = "parking-polygons-outline";
export const LINE_LAYER_ID = "parking-lines";
export const POINT_LAYER_ID = "parking-points";
export const EV_BADGE_LAYER_ID = "parking-ev-badge";
export const ACCESSIBLE_BADGE_LAYER_ID = "parking-accessible-badge";

/** Mirrors utils/colors.ts `getParkingStatus` priority order as a MapLibre
 * data-driven expression, so the map and the UI chrome never disagree
 * about what color a facility should be. */
export const PARKING_COLOR_EXPRESSION: ExpressionSpecification = [
  "case",
  ["==", ["get", "access"], "no"],
  STATUS_COLOR.no,
  ["==", ["get", "access"], "private"],
  STATUS_COLOR.private,
  [
    "any",
    ["==", ["get", "resident_only"], true],
    ["==", ["get", "access"], "residents"],
    ["==", ["get", "access"], "permit"],
  ],
  STATUS_COLOR.resident,
  ["==", ["get", "access"], "customers"],
  STATUS_COLOR.restricted,
  ["==", ["get", "fee"], true],
  STATUS_COLOR.paid,
  ["==", ["get", "fee"], false],
  STATUS_COLOR.free,
  STATUS_COLOR.unknown,
];

export const NOT_CLUSTER_FILTER: ExpressionSpecification = ["!", ["has", "point_count"]];
export const IS_POLYGON: ExpressionSpecification = ["==", ["geometry-type"], "Polygon"];
export const IS_LINE: ExpressionSpecification = ["==", ["geometry-type"], "LineString"];
export const IS_POINT: ExpressionSpecification = ["==", ["geometry-type"], "Point"];
