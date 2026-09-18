/**
 * Marker bitmaps, drawn at runtime on a canvas and registered with MapLibre
 * via `map.addImage()`.
 *
 * Drawing them ourselves (rather than using a symbol layer's `text-field`)
 * means the markers never depend on the basemap style shipping a particular
 * glyph/font range - emoji and symbol characters frequently render as empty
 * boxes in vector-tile glyph sets. Every shape here is plain canvas geometry,
 * so it looks identical everywhere.
 *
 * Each status gets its own distinct glyph as well as its own color, so the
 * map stays readable for colorblind users (color is never the only signal).
 */
import { STATUS_COLOR, type ParkingStatus } from "../../utils/colors";

const MARKER_PX = 56; // bitmap size; drawn at 2x and displayed at ~28px
const MARKER_PIXEL_RATIO = 2;
const BADGE_PX = 28;

type GlyphDrawer = (ctx: CanvasRenderingContext2D, cx: number, cy: number) => void;

function textGlyph(text: string, fontSize: number): GlyphDrawer {
  return (ctx, cx, cy) => {
    ctx.font = `700 ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cx, cy + 1);
  };
}

const crossGlyph: GlyphDrawer = (ctx, cx, cy) => {
  const d = 6;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - d, cy - d);
  ctx.lineTo(cx + d, cy + d);
  ctx.moveTo(cx + d, cy - d);
  ctx.lineTo(cx - d, cy + d);
  ctx.stroke();
};

const lockGlyph: GlyphDrawer = (ctx, cx, cy) => {
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy - 2, 4.2, Math.PI, 0);
  ctx.stroke();
  roundedRect(ctx, cx - 6.5, cy - 1.5, 13, 9.5, 2);
  ctx.fill();
};

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const STATUS_GLYPH: Record<ParkingStatus, GlyphDrawer> = {
  free: textGlyph("P", 21),
  paid: textGlyph("$", 21),
  resident: textGlyph("R", 20),
  restricted: textGlyph("!", 21),
  no: crossGlyph,
  private: lockGlyph,
  unknown: textGlyph("?", 21),
};

const ALL_STATUSES = Object.keys(STATUS_GLYPH) as ParkingStatus[];

export const iconIdForStatus = (status: ParkingStatus) => `pf-marker-${status}`;
export const EV_BADGE_ICON = "pf-badge-ev";
export const ACCESSIBLE_BADGE_ICON = "pf-badge-accessible";

function newCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return [canvas, canvas.getContext("2d")!];
}

/** A round "bubble": soft drop shadow, white ring, colored body, white glyph. */
function markerImage(color: string, glyph: GlyphDrawer): ImageData {
  const [, ctx] = newCanvas(MARKER_PX);
  const cx = MARKER_PX / 2;
  const cy = MARKER_PX / 2 - 1;
  const r = 20;

  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.42)";
  ctx.shadowBlur = 9;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 3.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  glyph(ctx, cx, cy);

  return ctx.getImageData(0, 0, MARKER_PX, MARKER_PX);
}

/** Small circular badge that sits on the corner of a marker. */
function badgeImage(color: string, draw: GlyphDrawer): ImageData {
  const [, ctx] = newCanvas(BADGE_PX);
  const cx = BADGE_PX / 2;
  const cy = BADGE_PX / 2;

  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.35)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, cy, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 9.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  draw(ctx, cx, cy);

  return ctx.getImageData(0, 0, BADGE_PX, BADGE_PX);
}

const boltGlyph: GlyphDrawer = (ctx, cx, cy) => {
  ctx.beginPath();
  ctx.moveTo(cx + 2.6, cy - 6.5);
  ctx.lineTo(cx - 3.8, cy + 0.8);
  ctx.lineTo(cx - 0.4, cy + 0.8);
  ctx.lineTo(cx - 2.4, cy + 6.5);
  ctx.lineTo(cx + 4, cy - 0.9);
  ctx.lineTo(cx + 0.5, cy - 0.9);
  ctx.closePath();
  ctx.fill();
};

/** Simplified wheelchair pictogram - drawn, not a font glyph, so it always renders. */
const accessibleGlyph: GlyphDrawer = (ctx, cx, cy) => {
  ctx.lineWidth = 1.9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.arc(cx - 0.5, cy - 5, 1.9, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy + 2.4, 4.6, Math.PI * 0.15, Math.PI * 1.75);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - 2.2, cy - 2.2);
  ctx.lineTo(cx - 2.2, cy + 1.6);
  ctx.lineTo(cx + 2.6, cy + 1.6);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx + 2.6, cy + 1.6);
  ctx.lineTo(cx + 4.4, cy + 5.6);
  ctx.stroke();
};

/** Registers every marker/badge image on the map. Safe to call more than once. */
export function registerMarkerImages(map: maplibregl.Map): void {
  for (const status of ALL_STATUSES) {
    const id = iconIdForStatus(status);
    if (map.hasImage(id)) continue;
    map.addImage(id, markerImage(STATUS_COLOR[status], STATUS_GLYPH[status]), {
      pixelRatio: MARKER_PIXEL_RATIO,
    });
  }
  if (!map.hasImage(EV_BADGE_ICON)) {
    map.addImage(EV_BADGE_ICON, badgeImage("#0d9488", boltGlyph), { pixelRatio: MARKER_PIXEL_RATIO });
  }
  if (!map.hasImage(ACCESSIBLE_BADGE_ICON)) {
    map.addImage(ACCESSIBLE_BADGE_ICON, badgeImage("#2563eb", accessibleGlyph), {
      pixelRatio: MARKER_PIXEL_RATIO,
    });
  }
}
