/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_DEFAULT_LAT: string;
  readonly VITE_DEFAULT_LON: string;
  readonly VITE_DEFAULT_ZOOM: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
