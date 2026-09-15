import { create } from "zustand";
import { emptyFilters, type FindParkingResponse, type ParkingFilterState, type SearchResult } from "../api/types";

interface FlyToTarget {
  center: [number, number]; // lon, lat
  zoom?: number;
}

interface AppState {
  filters: ParkingFilterState;
  setFilters: (patch: Partial<ParkingFilterState>) => void;
  resetFilters: () => void;

  selectedParkingId: string | null;
  selectParking: (id: string | null) => void;

  destination: SearchResult | null;
  setDestination: (result: SearchResult | null) => void;

  userLocation: [number, number] | null;
  setUserLocation: (loc: [number, number] | null) => void;

  flyTo: FlyToTarget | null;
  requestFlyTo: (center: [number, number], zoom?: number) => void;
  clearFlyTo: () => void;

  isFilterPanelOpen: boolean;
  setFilterPanelOpen: (open: boolean) => void;

  findParkingResults: FindParkingResponse | null;
  isFindParkingLoading: boolean;
  isFindParkingOpen: boolean;
  setFindParkingResults: (results: FindParkingResponse | null) => void;
  setFindParkingLoading: (loading: boolean) => void;
  setFindParkingOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  filters: emptyFilters,
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: emptyFilters }),

  selectedParkingId: null,
  selectParking: (id) => set({ selectedParkingId: id }),

  destination: null,
  setDestination: (result) => set({ destination: result }),

  userLocation: null,
  setUserLocation: (loc) => set({ userLocation: loc }),

  flyTo: null,
  requestFlyTo: (center, zoom) => set({ flyTo: { center, zoom } }),
  clearFlyTo: () => set({ flyTo: null }),

  isFilterPanelOpen: false,
  setFilterPanelOpen: (open) => set({ isFilterPanelOpen: open }),

  findParkingResults: null,
  isFindParkingLoading: false,
  isFindParkingOpen: false,
  setFindParkingResults: (results) => set({ findParkingResults: results }),
  setFindParkingLoading: (loading) => set({ isFindParkingLoading: loading }),
  setFindParkingOpen: (open) => set({ isFindParkingOpen: open }),
}));
