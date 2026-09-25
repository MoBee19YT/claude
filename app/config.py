"""Runtime settings, read from environment variables."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

# Any SQLAlchemy URL works: SQLite (default) or a hosted Postgres/MySQL database.
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'qompify.db'}")

# Comma-separated list of frontend origins allowed to call the API ("*" = any).
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

# Create and fill the database on startup when it is empty.
AUTO_SEED = os.getenv("AUTO_SEED", "1") == "1"

CURRENCY = "EUR"
PRICE_HISTORY_DAYS = 90
