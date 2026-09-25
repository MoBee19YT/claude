from datetime import date

# The homepage shows these "from" prices; the API must agree with it.
FRONTEND_PRICES = {
    "geforce-rtx-4070": 579, "geforce-rtx-4060-ti": 409, "radeon-rx-7800-xt": 529,
    "ryzen-5-7600": 209, "ryzen-7-7800x3d": 369, "core-i5-13400f": 179,
    "corsair-vengeance-32gb-ddr5-6000": 99, "kingston-fury-beast-16gb-ddr5": 54,
    "samsung-990-pro-2tb": 149, "wd-black-sn850x-1tb": 89, "lg-ultragear-27gp850": 329,
    "dell-s2722dgm": 239, "lenovo-legion-slim-5": 1149, "asus-tuf-gaming-a15": 999,
}


# --- meta -------------------------------------------------------------------

def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["products"] == 23
    assert body["shops"] == 4
    assert body["offers"] == 77
    assert body["last_import"] is not None


def test_root_redirects_to_docs(client):
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/docs"


def test_cors_allows_frontend(client):
    response = client.get("/api/categories", headers={"Origin": "http://localhost:5500"})
    assert response.headers["access-control-allow-origin"] == "*"


# --- catalog ----------------------------------------------------------------

def test_categories(client):
    categories = client.get("/api/categories").json()
    assert [c["slug"] for c in categories] == ["cpu", "gpu", "ram", "storage", "monitor", "laptop"]
    gpu = next(c for c in categories if c["slug"] == "gpu")
    assert gpu["product_count"] == 5
    assert gpu["lowest_price"] == 269


def test_prices_match_frontend(client):
    for slug, price in FRONTEND_PRICES.items():
        assert client.get(f"/api/products/{slug}").json()["lowest_price"] == price, slug


def test_products_filter_sort_and_paginate(client):
    body = client.get("/api/products", params={"category": "gpu", "sort": "price_asc", "page_size": 2}).json()
    assert body["total"] == 5 and body["pages"] == 3 and len(body["items"]) == 2
    everything = client.get("/api/products", params={"category": "gpu", "sort": "price_asc"}).json()["items"]
    prices = [p["lowest_price"] for p in everything]
    assert prices == sorted(prices)


def test_products_price_and_brand_filters(client):
    items = client.get("/api/products", params={"max_price": 100}).json()["items"]
    assert items and all(p["lowest_price"] <= 100 for p in items)
    amd = client.get("/api/products", params={"brand": "amd,intel", "category": "cpu"}).json()
    assert amd["total"] == 5


def test_product_card_has_headline_specs(client):
    card = client.get("/api/products", params={"q": "rtx 4070"}).json()["items"][0]
    displays = {s["key"]: s["display"] for s in card["headline_specs"]}
    assert displays == {"vram": "12 GB", "tdp": "200 W", "perf_score": "100"}


def test_product_detail(client):
    body = client.get("/api/products/geforce-rtx-4070").json()
    prices = [o["price"] for o in body["offers"]]
    assert prices == sorted(prices)
    assert body["price_stats"]["lowest"] == prices[0] == body["lowest_price"]
    assert body["price_stats"]["offer_count"] == len(prices) >= 2
    assert [s["name"] for s in body["spec_sections"]] == ["Memory", "Core", "Power", "Performance"]
    assert {"slug": "rtx-4070-vs-rx-7800-xt", "title": "RTX 4070 vs RX 7800 XT"} in body["comparisons"]


def test_prefix_unit_display(client):
    body = client.get("/api/products/corsair-vengeance-32gb-ddr5-6000").json()
    specs = {s["key"]: s["display"] for section in body["spec_sections"] for s in section["specs"]}
    assert specs["cas_latency"] == "CL36"
    assert specs["speed"] == "6000 MT/s"


def test_price_history(client):
    points = client.get("/api/products/ryzen-5-7600/price-history").json()
    assert len(points) == 91  # 90 days back + today
    assert points[-1]["day"] == date.today().isoformat()
    assert points[-1]["price"] == 209
    assert [p["day"] for p in points] == sorted(p["day"] for p in points)
    assert len(client.get("/api/products/ryzen-5-7600/price-history", params={"days": 7}).json()) == 8


def test_unknown_product_is_404(client):
    response = client.get("/api/products/nope")
    assert response.status_code == 404
    assert "nope" in response.json()["detail"]


# --- search -----------------------------------------------------------------

def test_search_rtx(client):
    hits = client.get("/api/search", params={"q": "rtx"}).json()
    assert len(hits) == 3
    assert all("RTX" in h["name"] and h["icon"] == "gpu" for h in hits)


def test_search_needs_every_word(client):
    names = [h["name"] for h in client.get("/api/search", params={"q": "amd 7800"}).json()]
    assert names == ["Radeon RX 7800 XT", "Ryzen 7 7800X3D"]


def test_search_ranks_whole_words_first(client):
    names = [h["name"] for h in client.get("/api/search", params={"q": "ryzen 7"}).json()]
    # "7" is also a prefix of "7600", which is fine while typing, but it must rank below the Ryzen 7s
    assert sorted(names[:2]) == ["Ryzen 7 7700", "Ryzen 7 7800X3D"]
    assert names[2:] == ["Ryzen 5 7600"]


def test_search_finds_partial_words(client):
    assert [h["name"] for h in client.get("/api/search", params={"q": "x3d"}).json()] == ["Ryzen 7 7800X3D"]


def test_search_empty_query_returns_popular(client):
    hits = client.get("/api/search").json()
    assert len(hits) == 6
    assert hits[0]["slug"] == "geforce-rtx-4070"  # highest popularity


def test_search_treats_wildcards_literally(client):
    assert client.get("/api/search", params={"q": "%"}).json() == []


# --- comparisons -------------------------------------------------------------

def test_popular_comparisons_match_homepage(client):
    cards = client.get("/api/comparisons/popular").json()
    assert [c["title"] for c in cards] == ["RTX 4070 vs RX 7800 XT", "Ryzen 5 7600 vs Intel i5-13400F",
                                           "32GB vs 16GB RAM"]
    assert [c["aspects"] for c in cards] == [["Performance", "Price", "Value"],
                                             ["Performance", "Power", "Price"],
                                             ["Performance", "Multitasking", "Price"]]
    assert cards[0]["products"][0]["lowest_price"] == 579


def test_all_comparisons_list_featured_first(client):
    slugs = [c["slug"] for c in client.get("/api/comparisons").json()]
    assert len(slugs) == 5 and slugs[0] == "rtx-4070-vs-rx-7800-xt"


def test_compare_gpu_verdict(client):
    body = client.get("/api/compare", params={"products": "geforce-rtx-4070,radeon-rx-7800-xt"}).json()
    assert body["winner"] == "radeon-rx-7800-xt"
    assert body["verdict"] == "Radeon RX 7800 XT wins on Performance, Price and Value."
    price = next(a for a in body["aspects"] if a["key"] == "price")
    assert price["lead_pct"] == 8.6  # €529 vs €579
    vram_row = next(r for r in body["rows"] if r["key"] == "vram")
    assert [c["best"] for c in vram_row["cells"]] == [False, True]


def test_compare_split_verdict(client):
    body = client.get("/api/comparisons/ryzen-5-7600-vs-core-i5-13400f").json()["result"]
    assert body["winner"] == "ryzen-5-7600"
    assert body["verdict"] == "Ryzen 5 7600 wins on Performance and Power; Intel Core i5-13400F wins on Price."


def test_compare_marks_ties_as_no_best(client):
    body = client.get("/api/compare", params={"products": "ryzen-5-7600,core-i5-13400f"}).json()
    tdp = next(r for r in body["rows"] if r["key"] == "tdp")  # both 65 W
    assert not any(c["best"] for c in tdp["cells"])


def test_compare_validation(client):
    assert client.get("/api/compare", params={"products": "geforce-rtx-4070"}).status_code == 400
    assert client.get("/api/compare", params={"products": "geforce-rtx-4070,geforce-rtx-4070"}).status_code == 400
    mixed = client.get("/api/compare", params={"products": "geforce-rtx-4070,ryzen-5-7600"})
    assert mixed.status_code == 400 and "same category" in mixed.json()["detail"]
    missing = client.get("/api/compare", params={"products": "geforce-rtx-4070,nope"})
    assert missing.status_code == 404 and "nope" in missing.json()["detail"]


# --- content -----------------------------------------------------------------

def test_articles_newest_first(client):
    articles = client.get("/api/articles").json()
    assert [a["title"] for a in articles][0] == "How much RAM do you actually need in 2026?"
    assert len(articles) == 4
    dates = [a["published_on"] for a in articles]
    assert dates == sorted(dates, reverse=True)
    assert client.get("/api/articles", params={"tag": "storage"}).json()[0]["slug"] == "ssd-vs-hdd"


def test_article_detail(client):
    body = client.get("/api/articles/gpu-vram-explained").json()
    assert body["body"].startswith("VRAM (video memory)")
    assert client.get("/api/articles/nope").status_code == 404


def test_shops(client):
    shops = client.get("/api/shops").json()
    assert len(shops) == 4
    assert sum(s["offer_count"] for s in shops) == 77
    assert all(s["last_import"] for s in shops)


# --- feed import -------------------------------------------------------------

def _feed(*items):
    rows = "".join(
        f"<SHOPITEM><ITEM_ID>{i}</ITEM_ID><PRODUCTNAME>{n}</PRODUCTNAME><URL>https://shop.example/{i}</URL>"
        f"<PRICE_VAT>{p}</PRICE_VAT><EAN>{e}</EAN><DELIVERY_DATE>{d}</DELIVERY_DATE></SHOPITEM>"
        for i, n, p, e, d in items)
    return f'<?xml version="1.0" encoding="utf-8"?><SHOP>{rows}</SHOP>'


def test_feed_import_updates_prices_and_history(fresh_db, tmp_path):
    from sqlalchemy import select

    from app.ingest.feeds import import_feed
    from app.models import Offer, PricePoint, Product, Shop

    rtx = fresh_db.scalar(select(Product).where(Product.slug == "geforce-rtx-4070"))
    ryzen = fresh_db.scalar(select(Product).where(Product.slug == "ryzen-5-7600"))
    shop = fresh_db.scalar(select(Shop).where(Shop.slug == "technova"))
    before = fresh_db.scalar(select(Offer.id).where(Offer.shop_id == shop.id).limit(1))
    assert before is not None

    feed = tmp_path / "feed.xml"
    feed.write_text(_feed(("T-1", "RTX 4070", "549.00", rtx.ean, "0"),
                          ("T-2", "Ryzen 5 7600", "199,90", ryzen.ean, "3"),  # comma decimal
                          ("T-3", "Mystery item", "10.00", "2999999999992", "0"),
                          ("T-4", "Broken price", "free", rtx.ean, "0")))
    report = import_feed(fresh_db, shop, str(feed))

    assert report.items == 3 and report.invalid == ["T-4"]
    assert report.unmatched == ["T-3 Mystery item"]
    assert report.created + report.updated == 2
    assert report.removed >= 1  # everything else TechNova listed before is gone

    offers = fresh_db.scalars(select(Offer).where(Offer.shop_id == shop.id)).all()
    assert {o.product_id: (o.price, o.in_stock, o.delivery_days) for o in offers} == {
        rtx.id: (549.0, True, 0), ryzen.id: (199.9, False, 3)}

    today = fresh_db.scalar(select(PricePoint).where(PricePoint.product_id == rtx.id,
                                                     PricePoint.day == date.today()))
    assert today.price == 549.0  # new lowest price recorded in history


def test_feed_parser_accepts_delivery_dates():
    from datetime import date as d

    from app.ingest.feeds import parse_feed

    items, invalid = parse_feed(_feed(("A", "x", "10", "1", "2026-10-05")).encode(), today=d(2026, 10, 1))
    assert invalid == [] and items[0].delivery_days == 4


def test_feed_parser_rejects_entity_expansion():
    import pytest
    from defusedxml import EntitiesForbidden

    from app.ingest.feeds import parse_feed

    bomb = b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><SHOP>&a;</SHOP>'
    with pytest.raises(EntitiesForbidden):
        parse_feed(bomb)
