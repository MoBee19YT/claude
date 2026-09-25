"""Qompify API.

    uvicorn app.main:app --reload

Interactive docs: http://127.0.0.1:8000/docs
"""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import AUTO_SEED, CORS_ORIGINS
from .database import get_db
from .ingest.seed import init_db
from .models import Offer, Product, Shop
from .routers import catalog, compare, content
from .schemas import Health


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db(seed_if_empty=AUTO_SEED)
    yield


app = FastAPI(
    title="Qompify API",
    version="0.1.0",
    summary="Demo backend for the Qompify hardware comparison site.",
    description="Read-only JSON API. Prices come from shop product feeds imported into a SQL database; "
                "all shops, prices and EANs in this demo are fictional.",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET"], allow_headers=["*"])

for module in (catalog, compare, content):
    app.include_router(module.router, prefix="/api")


@app.get("/api/health", response_model=Health, tags=["meta"])
def health(db: Session = Depends(get_db)):
    return Health(status="ok",
                  products=db.scalar(select(func.count(Product.id))),
                  offers=db.scalar(select(func.count(Offer.id))),
                  shops=db.scalar(select(func.count(Shop.id))),
                  last_import=db.scalar(select(func.max(Shop.last_import))))


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse("/docs")
