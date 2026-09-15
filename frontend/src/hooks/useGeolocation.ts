import { useCallback, useState } from "react";

interface GeolocationState {
  location: [number, number] | null; // [lon, lat]
  loading: boolean;
  error: string | null;
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({ location: null, loading: false, error: null });

  const request = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setState({ location: null, loading: false, error: "Geolocation is not supported by this browser" });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          location: [position.coords.longitude, position.coords.latitude],
          loading: false,
          error: null,
        });
      },
      (error) => {
        setState({ location: null, loading: false, error: error.message || "Unable to get your location" });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  return { ...state, request };
}
