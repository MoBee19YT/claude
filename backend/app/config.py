"""
Central application configuration.

Everything here is read from environment variables (via a .env file in
development, or real env vars in production/Docker). No secret or API key
is ever hardcoded - see backend/.env.example for what can be configured.
"""
from functools import lru_cache
from typing import List, Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database. Hosted providers (Render, Railway, Heroku-style DATABASE_URL
    # env vars) typically inject a bare "postgresql://" URL - normalized to
    # the asyncpg driver SQLAlchemy needs, so no manual edits are required
    # after pasting a provider's connection string in as-is.
    database_url: str = "postgresql+asyncpg://parking:parking@localhost:5432/parking"

    @field_validator("database_url")
    @classmethod
    def _use_asyncpg_driver(cls, v: str) -> str:
        if v.startswith("postgresql://"):
            return "postgresql+asyncpg://" + v[len("postgresql://") :]
        if v.startswith("postgres://"):  # some providers use the short scheme
            return "postgresql+asyncpg://" + v[len("postgres://") :]
        return v

    # Default region (Prague) - only used to seed the import script and as
    # the map's initial viewport. Nothing in the data model is Prague-specific.
    default_bbox: str = "14.2246,49.9420,14.7071,50.1774"
    default_city: str = "Prague"
    default_country: str = "Czech Republic"

    # OpenStreetMap / Overpass
    overpass_url: str = "https://overpass-api.de/api/interpreter"
    osm_live_fallback: bool = True

    # Nominatim (OSM geocoding/search)
    nominatim_url: str = "https://nominatim.openstreetmap.org"
    nominatim_contact_email: str = "you@example.com"

    # Optional commercial providers - blank key means "disabled", not an error.
    tomtom_api_key: Optional[str] = None
    here_api_key: Optional[str] = None

    # CORS
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def default_bbox_tuple(self) -> tuple[float, float, float, float]:
        parts = [float(x) for x in self.default_bbox.split(",")]
        return parts[0], parts[1], parts[2], parts[3]


@lru_cache
def get_settings() -> Settings:
    return Settings()
