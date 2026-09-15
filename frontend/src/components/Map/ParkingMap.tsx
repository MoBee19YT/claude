import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { BBox } from "../../api/client";
import type { ParkingFeatureCollection } from "../../api/types";
import { useParkingData } from "../../hooks/useParkingData";
import { useAppStore } from "../../store/useAppStore";
import {
  ACCESSIBLE_BADGE_LAYER_ID,
  CLUSTER_COUNT_LAYER_ID,
  CLUSTER_LAYER_ID,
  EV_BADGE_LAYER_ID,
  IS_LINE,
  IS_POINT,
  IS_POLYGON,
  LINE_LAYER_ID,
  NOT_CLUSTER_FILTER,
  PARKING_COLOR_EXPRESSION,
  PARKING_SOURCE_ID,
  POINT_LAYER_ID,
  POLYGON_FILL_LAYER_ID,
  POLYGON_OUTLINE_LAYER_ID,
} from "./layers";
import { BASEMAP_STYLE_URL, DEFAULT_CENTER, DEFAULT_PITCH, DEFAULT_ZOOM } from "./mapStyle";

const EMPTY_FC: ParkingFeatureCollection = {
  type: "FeatureCollection",
  features: [],
  meta: { count: 0, attribution: "", providers_active: [], providers_available_not_configured: [], truncated: false },
};

const CLICKABLE_LAYERS = [CLUSTER_LAYER_ID, POLYGON_FILL_LAYER_ID, LINE_LAYER_ID, POINT_LAYER_ID];

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

  const [viewport, setViewport] = useState<{ bbox: BBox; zoom: number } | null>(null);

  const filters = useAppStore((s) => s.filters);
  const selectParking = useAppStore((s) => s.selectParking);
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
      map.addSource(PARKING_SOURCE_ID, {
        type: "geojson",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: EMPTY_FC as any,
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 50,
      });

      map.addLayer({
        id: CLUSTER_LAYER_ID,
        type: "circle",
        source: PARKING_SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#1e293b",
          "circle-opacity": 0.88,
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26, 200, 32],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: CLUSTER_COUNT_LAYER_ID,
        type: "symbol",
        source: PARKING_SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: POLYGON_FILL_LAYER_ID,
        type: "fill",
        source: PARKING_SOURCE_ID,
        filter: ["all", NOT_CLUSTER_FILTER, IS_POLYGON],
        paint: { "fill-color": PARKING_COLOR_EXPRESSION, "fill-opacity": 0.35 },
      });
      map.addLayer({
        id: POLYGON_OUTLINE_LAYER_ID,
        type: "line",
        source: PARKING_SOURCE_ID,
        filter: ["all", NOT_CLUSTER_FILTER, IS_POLYGON],
        paint: { "line-color": PARKING_COLOR_EXPRESSION, "line-width": 2 },
      });
      map.addLayer({
        id: LINE_LAYER_ID,
        type: "line",
        source: PARKING_SOURCE_ID,
        filter: ["all", NOT_CLUSTER_FILTER, IS_LINE],
        layout: { "line-cap": "round" },
        paint: { "line-color": PARKING_COLOR_EXPRESSION, "line-width": 5, "line-opacity": 0.85 },
      });
      map.addLayer({
        id: POINT_LAYER_ID,
        type: "circle",
        source: PARKING_SOURCE_ID,
        filter: ["all", NOT_CLUSTER_FILTER, IS_POINT],
        paint: {
          "circle-color": PARKING_COLOR_EXPRESSION,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 4, 16, 7, 19, 10],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: EV_BADGE_LAYER_ID,
        type: "symbol",
        source: PARKING_SOURCE_ID,
        filter: ["all", NOT_CLUSTER_FILTER, ["==", ["get", "ev"], true]],
        layout: {
          "text-field": "⚡",
          "text-size": 11,
          "text-offset": [0.9, -0.9],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
      });
      map.addLayer({
        id: ACCESSIBLE_BADGE_LAYER_ID,
        type: "symbol",
        source: PARKING_SOURCE_ID,
        filter: ["all", NOT_CLUSTER_FILTER, ["==", ["get", "accessible"], true]],
        layout: {
          "text-field": "♿",
          "text-size": 11,
          "text-offset": [-0.9, -0.9],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
      });

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
          const source = map.getSource(PARKING_SOURCE_ID) as GeoJSONSource;
          source.getClusterExpansionZoom(clusterId).then((zoom) => {
            const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
            map.easeTo({ center: coords, zoom });
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
    };
  }, [selectParking]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource(PARKING_SOURCE_ID) as GeoJSONSource | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (source) source.setData((data ?? EMPTY_FC) as any);
  }, [data]);

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
