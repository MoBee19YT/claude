import { useEffect, useRef, useState } from "react";
import { fetchParking, type BBox } from "../api/client";
import type { ParkingFeatureCollection, ParkingFilterState } from "../api/types";

interface ParkingDataState {
  data: ParkingFeatureCollection | null;
  loading: boolean;
  error: string | null;
}

const DEBOUNCE_MS = 350;

/** Fetches parking within `bbox` whenever bbox/zoom/filters change, debounced
 * so panning the map doesn't fire a request on every animation frame. */
export function useParkingData(
  bbox: BBox | null,
  zoom: number,
  filters: ParkingFilterState,
  refPoint?: [number, number],
): ParkingDataState {
  const [state, setState] = useState<ParkingDataState>({ data: null, loading: false, error: null });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!bbox) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      const requestId = ++requestIdRef.current;
      setState((s) => ({ ...s, loading: true, error: null }));
      fetchParking(bbox, zoom, filters, refPoint)
        .then((data) => {
          if (requestId === requestIdRef.current) {
            setState({ data, loading: false, error: null });
          }
        })
        .catch((err: Error) => {
          if (requestId === requestIdRef.current) {
            setState((s) => ({ ...s, loading: false, error: err.message }));
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bbox?.join(","), zoom, JSON.stringify(filters), refPoint?.join(",")]);

  return state;
}
