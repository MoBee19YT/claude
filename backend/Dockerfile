FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Shell form (not --reload) so $PORT is respected on hosts like Render that
# assign it dynamically, falling back to 8000 for local/Docker Compose use.
# Local dev hot-reload is added via docker-compose.yml's command override.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
