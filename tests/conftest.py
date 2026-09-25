import os
import tempfile

import pytest

# Point the app at a throwaway database before it is imported.
_tmp = tempfile.mkdtemp(prefix="qompify-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/api.db"
os.environ["AUTO_SEED"] = "1"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:  # runs the startup hook, which seeds the database
        yield c


@pytest.fixture()
def fresh_db(tmp_path):
    """An isolated, seeded database for tests that change data."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from app.database import Base
    from app.ingest.seed import seed

    engine = create_engine(f"sqlite:///{tmp_path}/fresh.db")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        seed(db)
        yield db
    engine.dispose()
