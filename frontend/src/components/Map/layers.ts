import type { ExpressionSpecification } from "maplibre-gl";
import { STATUS_COLOR } from "../../utils/colors";
import { iconIdForStatus } from "./markerImages";

export const PARKING_SOURCE_ID = "parking";
/**
 * A second, point-only copy of the same data used purely for the zoomed-out
 * cluster view. It exists because MapLibre's GeoJSON clustering runs through
 * supercluster, which only understands Point geometry and silently discards
 * polygons and lines - so clustering the main source would make every parking
 * lot footprint and every on-street segment invisible.
 */
export const PARKING_OVERVIEW_SOURCE_ID = "parking-overview";
/**
 * Holds only the selected facility, as a single centroid Point. A `circle`
 * layer draws one circle per vertex, so pointing the selection pulse at a
 * polygon's own geometry would ring every corner of the footprint instead
 * of highlighting it once.
 */
export const PARKING_SELECTED_SOURCE_ID = "parking-selected";
export const BASEMAP_WASH_SOURCE_ID = "basemap-wash";

/** Below this zoom the map shows clustered bubbles; at or above it, real
 * footprints/segments and individual markers. */
export const CLUSTER_SWITCH_ZOOM = 12.5;

export const BASEMAP_WASH_LAYER_ID = "basemap-wash";
export const CLUSTER_GLOW_LAYER_ID = "parking-cluster-glow";
export const CLUSTER_LAYER_ID = "parking-clusters";
export const CLUSTER_COUNT_LAYER_ID = "parking-cluster-count";
export const POLYGON_FILL_LAYER_ID = "parking-polygons";
export const POLYGON_OUTLINE_LAYER_ID = "parking-polygons-outline";
export const LINE_LAYER_ID = "parking-lines";
export const LINE_SECOND_SIDE_LAYER_ID = "parking-lines-second-side";
export const SELECTED_PULSE_LAYER_ID = "parking-selected-pulse";
export const MARKER_LAYER_ID = "parking-markers";
export const OVERVIEW_MARKER_LAYER_ID = "parking-overview-markers";
export const EV_BADGE_LAYER_ID = "parking-ev-badge";
export const ACCESSIBLE_BADGE_LAYER_ID = "parking-accessible-badge";
export const LABEL_LAYER_ID = "parking-labels";

/**
 * Status priority, shared by the color and icon expressions below and by
 * `getParkingStatus` in utils/colors.ts: a restriction outranks pricing,
 * and anything known outranks "unknown". Keeping one order in one place is
 * what stops the map, the legend and the details panel from disagreeing.
 */
const statusCases = (value: (status: string) => string): ExpressionSpecification =>
  [
    "case",
    ["==", ["get", "access"], "no"],
    value("no"),
    ["==", ["get", "access"], "private"],
    value("private"),
    [
      "any",
      ["==", ["get", "resident_only"], true],
      ["==", ["get", "access"], "residents"],
      ["==", ["get", "access"], "permit"],
    ],
    value("resident"),
    ["==", ["get", "access"], "customers"],
    value("restricted"),
    ["==", ["get", "fee"], true],
    value("paid"),
    ["==", ["get", "fee"], false],
    value("free"),
    value("unknown"),
  ] as ExpressionSpecification;

export const PARKING_COLOR_EXPRESSION = statusCases(
  (status) => STATUS_COLOR[status as keyof typeof STATUS_COLOR],
);

export const PARKING_ICON_EXPRESSION = statusCases((status) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  iconIdForStatus(status as any),
);

/**
 * On-street parking is drawn as a row of bays alongside the road rather than
 * a line down the middle of it. `line-offset` is positive to the right of the
 * way's direction, which is the same convention OSM's left/right tags use, so
 * the bays land on the side the data actually says. Unknown side stays on the
 * centreline rather than guessing.
 */
const sideOffset = (magnitude: number): ExpressionSpecification =>
  [
    "match",
    ["to-string", ["get", "street_side"]],
    "left",
    -magnitude,
    ["right", "both"],
    magnitude,
    0, // side unknown - sit on the centreline rather than claiming a side
  ] as ExpressionSpecification;

export const STREET_OFFSET_EXPRESSION: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  13,
  sideOffset(2),
  18,
  sideOffset(9),
];

export const STREET_OFFSET_MIRRORED_EXPRESSION: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  13,
  -2,
  18,
  -9,
];

/** Chunky dashes read as individual parking bays. Units are multiples of
 * line-width, and `line-cap: butt` keeps the ends square. */
export const STREET_BAY_DASHARRAY = [1.1, 0.7];

export const NOT_CLUSTER_FILTER: ExpressionSpecification = ["!", ["has", "point_count"]];
export const IS_POLYGON: ExpressionSpecification = ["==", ["geometry-type"], "Polygon"];
export const IS_LINE: ExpressionSpecification = ["==", ["geometry-type"], "LineString"];

/** A world-covering polygon used to desaturate the basemap underneath the
 * parking layers, so the color coding is what your eye lands on first. */
export const WORLD_POLYGON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-180, -85],
            [180, -85],
            [180, 85],
            [-180, 85],
            [-180, -85],
          ],
        ],
      },
    },
  ],
} as const;
