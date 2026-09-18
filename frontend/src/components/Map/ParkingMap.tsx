import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { BBox } from "../../api/client";
import type { ParkingFeatureCollection } from "../../api/types";
import { useParkingData } from "../../hooks/useParkingData";
import { useAppStore } from "../../store/useAppStore";
import { featureCenter } from "../../utils/geo";
import {
  ACCESSIBLE_BADGE_LAYER_ID,
  BASEMAP_WASH_LAYER_ID,
  BASEMAP_WASH_SOURCE_ID,
  CLUSTER_COUNT_LAYER_ID,
  CLUSTER_GLOW_LAYER_ID,
  CLUSTER_LAYER_ID,
  CLUSTER_SWITCH_ZOOM,
  EV_BADGE_LAYER_ID,
  IS_LINE,
  IS_POLYGON,
  LABEL_LAYER_ID,
  LINE_LAYER_ID,
  LINE_SECOND_SIDE_LAYER_ID,
  MARKER_LAYER_ID,
  NOT_CLUSTER_FILTER,
  OVERVIEW_MARKER_LAYER_ID,
  PARKING_COLOR_EXPRESSION,
  PARKING_ICON_EXPRESSION,
  PARKING_OVERVIEW_SOURCE_ID,
  PARKING_SELECTED_SOURCE_ID,
  PARKING_SOURCE_ID,
  POLYGON_FILL_LAYER_ID,
  POLYGON_OUTLINE_LAYER_ID,
  SELECTED_PULSE_LAYER_ID,
  STREET_BAY_DASHARRAY,
  STREET_OFFSET_EXPRESSION,
  STREET_OFFSET_MIRRORED_EXPRESSION,
  WORLD_POLYGON,
} from "./layers";
import { ACCESSIBLE_BADGE_ICON, EV_BADGE_ICON, registerMarkerImages } from "./markerImages";
import { BASEMAP_STYLE_URL, DEFAULT_CENTER, DEFAULT_PITCH, DEFAULT_ZOOM } from "./mapStyle";

const EMPTY_FC: ParkingFeatureCollection = {
  type: "FeatureCollection",
  features: [],
  meta: { count: 0, attribution: "", providers_active: [], providers_available_not_configured: [], truncated: false },
};

const CLICKABLE_LAYERS = [
  CLUSTER_LAYER_ID,
  OVERVIEW_MARKER_LAYER_ID,
  MARKER_LAYER_ID,
  POLYGON_FILL_LAYER_ID,
  LINE_LAYER_ID,
];

const EMPTY_POINTS = { type: "FeatureCollection" as const, features: [] };

/** Point-only projection of the data, for the clustered overview source. */
function toCentroidPoints(collection: ParkingFeatureCollection) {
  return {
    type: "FeatureCollection" as const,
    features: collection.features.map((feature) => ({
      type: "Feature" as const,
      properties: feature.properties,
      geometry: { type: "Point" as const, coordinates: featureCenter(feature.geometry) },
    })),
  };
}

interface ParkingMapProps {
  onLoadingChange: (loading: boolean) => void;
  onErrorChange: (error: string | null) => void;
  onMetaChange: (meta: ParkingFeatureCollection["meta"] | null) => void;
}

export function ParkingMap({ onLoadingChange, onErrorChange, onMetaChange }: ParkingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const destMarkerRef = useRef<Marker | null>(null);
  const layersReadyRef = useRef(false);
  const latestDataRef = useRef<ParkingFeatureCollection | null>(null);

  const [viewport, setViewport] = useState<{ bbox: BBox; zoom: number } | null>(null);

  const filters = useAppStore((s) => s.filters);
  const selectParking = useAppStore((s) => s.selectParking);
  const selectedParkingId = useAppStore((s) => s.selectedParkingId);
  const destination = useAppStore((s) => s.destination);
  const userLocation = useAppStore((s) => s.userLocation);
  const flyTo = useAppStore((s) => s.flyTo);
  const clearFlyTo = useAppStore((s) => s.clearFlyTo);

  const refPoint: [number, number] | undefined = destination
    ? [destination.longitude, destination.latitude]
    : (userLocation ?? undefined);

  const { data, loading, error } = useParkingData(
    viewport?.bbox ?? null,
    viewport?.zoom ?? DEFAULT_ZOOM,
    filters,
    refPoint,
  );

  useEffect(() => onLoadingChange(loading), [loading, onLoadingChange]);
  useEffect(() => onErrorChange(error), [error, onErrorChange]);
  useEffect(() => onMetaChange(data?.meta ?? null), [data, onMetaChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: DEFAULT_PITCH,
      maxPitch: 70,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    map.on("load", () => {
      registerMarkerImages(map);

      // Mute the basemap so the color-coded parking pops. Inserted below the
      // style's first symbol layer so place labels stay crisp on top.
      const firstSymbolLayer = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
      map.addSource(BASEMAP_WASH_SOURCE_ID, {
        type: "geojson",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: WORLD_POLYGON as any,
      });
      map.addLayer(
        {
          id: BASEMAP_WASH_LAYER_ID,
          type: "fill",
          source: BASEMAP_WASH_SOURCE_ID,
          paint: { "fill-color": "#ffffff", "fill-opacity": 0.74 },
        },
        firstSymbolLayer,
      );

      // Real geometry, never clustered (clustering would discard polygons/lines).
      map.addSource(PARKING_SOURCE_ID, {
        type: "geojson",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: EMPTY_FC as any,
      });
      // Centroid points, clustered, for the zoomed-out overview only.
      map.addSource(PARKING_OVERVIEW_SOURCE_ID, {
        type: "geojson",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: EMPTY_FC as any,
        cluster: true,
        clusterMaxZoom: Math.floor(CLUSTER_SWITCH_ZOOM),
        clusterRadius: 44,
      });

      // --- facility footprints -------------------------------------------
      map.addLayer({
        id: POLYGON_FILL_LAYER_ID,
        type: "fill",
        source: PARKING_SOURCE_ID,
        minzoom: CLUSTER_SWITCH_ZOOM,
        filter: IS_POLYGON,
        paint: { "fill-color": PARKING_COLOR_EXPRESSION, "fill-opacity": 0.2 },
      });
      map.addLayer({
        id: POLYGON_OUTLINE_LAYER_ID,
        type: "line",
        source: PARKING_SOURCE_ID,
        minzoom: CLUSTER_SWITCH_ZOOM,
        filter: IS_POLYGON,
        paint: {
          "line-color": PARKING_COLOR_EXPRESSION,
          "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1.5, 17, 3],
          "line-opacity": 0.95,
        },
      });

      // --- on-street parking, drawn as bays alongside the road ------------
      map.addLayer({
        id: LINE_LAYER_ID,
        type: "line",
        source: PARKING_SOURCE_ID,
        minzoom: CLUSTER_SWITCH_ZOOM,
        filter: IS_LINE,
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: {
          "line-color": PARKING_COLOR_EXPRESSION,
          "line-width": ["interpolate", ["linear"], ["zoom"], 13, 3, 18, 9],
          "line-offset": STREET_OFFSET_EXPRESSION,
          "line-dasharray": STREET_BAY_DASHARRAY,
        },
      });
      // Streets tagged as having parking on both sides get a mirrored row.
      map.addLayer({
        id: LINE_SECOND_SIDE_LAYER_ID,
        type: "line",
        source: PARKING_SOURCE_ID,
        minzoom: CLUSTER_SWITCH_ZOOM,
        filter: ["all", IS_LINE, ["==", ["get", "street_side"], "both"]],
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: {
          "line-color": PARKING_COLOR_EXPRESSION,
          "line-width": ["interpolate", ["linear"], ["zoom"], 13, 3, 18, 9],
          "line-offset": STREET_OFFSET_MIRRORED_EXPRESSION,
          "line-dasharray": STREET_BAY_DASHARRAY,
        },
      });

      // --- selection pulse (animated, below the markers) ------------------
      map.addSource(PARKING_SELECTED_SOURCE_ID, {
        type: "geojson",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: EMPTY_POINTS as any,
      });
      map.addLayer({
        id: SELECTED_PULSE_LAYER_ID,
        type: "circle",
        source: PARKING_SELECTED_SOURCE_ID,
        paint: {
          "circle-color": PARKING_COLOR_EXPRESSION,
          "circle-opacity": 0.28,
          "circle-radius": 20,
          "circle-stroke-color": PARKING_COLOR_EXPRESSION,
          "circle-stroke-width": 2,
          "circle-stroke-opacity": 0.5,
        },
      });

      // --- the markers themselves -----------------------------------------
      // One symbol layer covers every geometry type: MapLibre anchors the icon
      // at a point's location, a line's middle and a polygon's centroid, so a
      // lot mapped as a footprint still gets a visible pin.
      map.addLayer({
        id: MARKER_LAYER_ID,
        type: "symbol",
        source: PARKING_SOURCE_ID,
        minzoom: CLUSTER_SWITCH_ZOOM,
        layout: {
          "icon-image": PARKING_ICON_EXPRESSION,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 12.5, 0.65, 15, 0.85, 17, 1],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });

      map.addLayer({
        id: EV_BADGE_LAYER_ID,
        type: "symbol",
        source: PARKING_SOURCE_ID,
        minzoom: CLUSTER_SWITCH_ZOOM,
        filter: ["==", ["get", "ev"], true],
        layout: {
          "icon-image": EV_BADGE_ICON,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 12.5, 0.6, 17, 0.9],
          "icon-offset": [13, -13],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });
      map.addLayer({
        id: ACCESSIBLE_BADGE_LAYER_ID,
        type: "symbol",
        source: PARKING_SOURCE_ID,
        minzoom: CLUSTER_SWITCH_ZOOM,
        filter: ["==", ["get", "accessible"], true],
        layout: {
          "icon-image": ACCESSIBLE_BADGE_ICON,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 12.5, 0.6, 17, 0.9],
          "icon-offset": [-13, -13],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });

      // --- zoomed-out overview: clusters + lone markers --------------------
      map.addLayer({
        id: OVERVIEW_MARKER_LAYER_ID,
        type: "symbol",
        source: PARKING_OVERVIEW_SOURCE_ID,
        maxzoom: CLUSTER_SWITCH_ZOOM,
        filter: NOT_CLUSTER_FILTER,
        layout: {
          "icon-image": PARKING_ICON_EXPRESSION,
          "icon-size": 0.6,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });
      map.addLayer({
        id: CLUSTER_GLOW_LAYER_ID,
        type: "circle",
        source: PARKING_OVERVIEW_SOURCE_ID,
        maxzoom: CLUSTER_SWITCH_ZOOM,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#0f172a",
          "circle-opacity": 0.14,
          "circle-radius": ["step", ["get", "point_count"], 26, 10, 31, 50, 37, 200, 44],
        },
      });
      map.addLayer({
        id: CLUSTER_LAYER_ID,
        type: "circle",
        source: PARKING_OVERVIEW_SOURCE_ID,
        maxzoom: CLUSTER_SWITCH_ZOOM,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#0f172a",
          "circle-radius": ["step", ["get", "point_count"], 19, 10, 24, 50, 30, 200, 37],
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Text layers need the basemap style to expose a `glyphs` URL and the
      // font we ask for. A custom VITE_MAP_STYLE_URL might do neither, and a
      // throw here would otherwise abort the rest of this handler and leave
      // the map with no markers or click handling - so degrade to "no text"
      // instead of "no map".
      try {
        map.addLayer({
          id: CLUSTER_COUNT_LAYER_ID,
          type: "symbol",
          source: PARKING_OVERVIEW_SOURCE_ID,
          maxzoom: CLUSTER_SWITCH_ZOOM,
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["Noto Sans Bold"],
            "text-size": ["step", ["get", "point_count"], 13, 50, 15, 200, 17],
            "text-allow-overlap": true,
          },
          paint: { "text-color": "#ffffff" },
        });
        map.addLayer({
          id: LABEL_LAYER_ID,
          type: "symbol",
          source: PARKING_SOURCE_ID,
          minzoom: 15.5,
          filter: ["has", "name"],
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 12,
            "text-offset": [0, 1.6],
            "text-anchor": "top",
            "text-max-width": 9,
            "text-optional": true,
          },
          paint: {
            "text-color": "#0f172a",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.6,
          },
        });
      } catch (err) {
        console.warn("Basemap style has no usable glyphs - map text labels disabled.", err);
      }

      layersReadyRef.current = true;
      // The first fetch often resolves before the style finishes loading, so
      // push whatever we already have into the freshly-created sources.
      if (latestDataRef.current) setSourceData(map, latestDataRef.current);

      const updateViewport = () => {
        const b = map.getBounds();
        setViewport({
          bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
          zoom: map.getZoom(),
        });
      };
      updateViewport();
      map.on("moveend", updateViewport);

      map.on("click", (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: CLICKABLE_LAYERS });
        if (!features.length) {
          selectParking(null);
          return;
        }
        const feature = features[0];
        if (feature.properties?.cluster) {
          const clusterId = feature.properties.cluster_id;
          const clusterSource = map.getSource(PARKING_OVERVIEW_SOURCE_ID) as GeoJSONSource;
          clusterSource.getClusterExpansionZoom(clusterId).then((zoom) => {
            const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
            map.easeTo({ center: coords, zoom: Math.max(zoom, CLUSTER_SWITCH_ZOOM) });
          });
          return;
        }
        if (feature.properties?.id) {
          selectParking(feature.properties.id as string);
        }
      });

      CLICKABLE_LAYERS.forEach((id) => {
        map.on("mouseenter", id, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", id, () => {
          map.getCanvas().style.cursor = "";
        });
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layersReadyRef.current = false;
    };
  }, [selectParking]);

  useEffect(() => {
    latestDataRef.current = data ?? EMPTY_FC;
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;
    setSourceData(map, data ?? EMPTY_FC);
  }, [data]);

  // Selection: point the pulse source at the chosen facility and animate it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;

    const source = map.getSource(PARKING_SELECTED_SOURCE_ID) as GeoJSONSource | undefined;
    const selected = selectedParkingId
      ? latestDataRef.current?.features.find((f) => f.properties.id === selectedParkingId)
      : undefined;

    if (!source || !selected) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      source?.setData(EMPTY_POINTS as any);
      return;
    }
    source.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: selected.properties,
          geometry: { type: "Point", coordinates: featureCenter(selected.geometry) },
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    let frame = 0;
    const start = performance.now();
    const animate = (now: number) => {
      const t = ((now - start) % 1600) / 1600;
      map.setPaintProperty(SELECTED_PULSE_LAYER_ID, "circle-radius", 18 + t * 26);
      map.setPaintProperty(SELECTED_PULSE_LAYER_ID, "circle-opacity", 0.3 * (1 - t));
      map.setPaintProperty(SELECTED_PULSE_LAYER_ID, "circle-stroke-opacity", 0.6 * (1 - t));
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [selectedParkingId, data]);

  useEffect(() => {
    if (!flyTo || !mapRef.current) return;
    mapRef.current.flyTo({ center: flyTo.center, zoom: flyTo.zoom ?? 16, essential: true });
    clearFlyTo();
  }, [flyTo, clearFlyTo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }
    if (destination) {
      const el = document.createElement("div");
      el.className = "destination-marker";
      destMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([destination.longitude, destination.latitude])
        .addTo(map);
    }
  }, [destination]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
    if (userLocation) {
      const el = document.createElement("div");
      el.className = "user-location-marker";
      el.innerHTML = '<span class="user-location-pulse"></span><span class="user-location-dot"></span>';
      userMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(userLocation).addTo(map);
    }
  }, [userLocation]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

function setSourceData(map: MapLibreMap, collection: ParkingFeatureCollection): void {
  const detail = map.getSource(PARKING_SOURCE_ID) as GeoJSONSource | undefined;
  const overview = map.getSource(PARKING_OVERVIEW_SOURCE_ID) as GeoJSONSource | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (detail) detail.setData(collection as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (overview) overview.setData(toCentroidPoints(collection) as any);
}
