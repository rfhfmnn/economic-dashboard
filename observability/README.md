# Observability Stack (OpenTelemetry, Prometheus, Loki, Tempo, Grafana)

This directory contains an institutional-grade, dedicated observability stack designed to ingest, process, correlate, and visualize distributed traces, metrics, and structured logs for the **Economic & Credit Risk Dashboard**.

It is isolated as an independent Docker Compose project (`name: economic-dashboard-observability`) from the core application stack.

---

## Architecture Overview

```text
+-----------------------------------------------------------+
|               Economic Dashboard Backend                  |
|     (FastAPI + HTTPX + SQLAlchemy + OpenTelemetry SDK)    |
+-----------------------------------------------------------+
                              |
                     OTLP (gRPC/HTTP)
                      4317 / 4318
                              v
+-----------------------------------------------------------+
|               OpenTelemetry Collector                     |
|  - Receivers: OTLP (4317 gRPC, 4318 HTTP), Prometheus     |
|  - Processors: memory_limiter, batch                      |
|  - Exporters: Tempo (traces), Prometheus (metrics), Loki  |
+-----------------------------------------------------------+
          |                     |                     |
     Traces (OTLP)         Metrics Scrape         Logs (OTLP)
          v                     v                     v
+------------------+  +------------------+  +------------------+
|      Tempo       |  |    Prometheus    |  |       Loki       |
|  (Traces: 3200)  |  | (Metrics: 9090)  |  |   (Logs: 3100)   |
+------------------+  +------------------+  +------------------+
          \                     |                     /
           \                    |                    /
            v                   v                   v
+-----------------------------------------------------------+
|                         Grafana                           |
|       (UI: 3000 - Provisioned Datasources & Dashboards)   |
|   - Trace to Log (Tempo -> Loki)                          |
|   - Log to Trace (Loki -> Tempo via TraceID regex)        |
|   - Trace to Metrics (Tempo -> Prometheus)                |
+-----------------------------------------------------------+
```

---

## Services & Ports

| Service | Port | Description |
|---|---|---|
| **OpenTelemetry Collector** | `4317` | OTLP gRPC ingestion endpoint |
| | `4318` | OTLP HTTP ingestion endpoint |
| | `8888` | Collector internal health & runtime metrics |
| | `8889` | Prometheus scrape endpoint for application metrics |
| | `13133` | Collector health check extension |
| **Prometheus** | `9090` | Time-series metrics engine & web console |
| **Loki** | `3100` | Log aggregation engine (native `/otlp` ingestion) |
| **Tempo** | `3200` | Distributed trace query and storage engine |
| **Grafana** | `3000` | Unified visualization UI (auto-logged in as Admin) |

---

## Directory Structure

```text
observability/
├── docker-compose.yaml             # Standalone Compose orchestration
├── .env.example                    # Port & credential customization template
├── README.md                       # Stack documentation & connection guide
├── otel-collector/
│   └── config.yaml                 # OpenTelemetry Collector pipelines & routing
├── prometheus/
│   └── prometheus.yaml             # Prometheus scrape target configurations
├── loki/
│   └── loki-config.yaml            # Loki 3.x storage, schema & indexing config
├── tempo/
│   └── tempo-config.yaml           # Tempo 2.x distributor & trace storage config
└── grafana/
    └── provisioning/
        ├── datasources/
        │   └── datasources.yaml    # Pre-provisioned Prometheus, Tempo, and Loki
        └── dashboards/
            ├── dashboards.yaml     # Dashboard provider declaration
            └── overview.json       # Observability Stack Overview dashboard
```

---

## Quickstart

### 1. Launch the Observability Stack
Run from the root or within `observability/`:

```bash
docker compose -f observability/docker-compose.yaml up -d
```

Check service status:
```bash
docker compose -f observability/docker-compose.yaml ps
```

### 2. Access the UIs
- **Grafana:** [http://localhost:3000](http://localhost:3000) (Anonymous Admin enabled)
- **Prometheus Console:** [http://localhost:9090](http://localhost:9090)
- **Tempo Ready Check:** [http://localhost:3200/ready](http://localhost:3200/ready)
- **Loki Ready Check:** [http://localhost:3100/ready](http://localhost:3100/ready)
- **OTel Collector Health:** [http://localhost:13133/](http://localhost:13133/)

---

## Connecting the Application Stack

### Option A: Running Backend Locally (Development Python Process)
In `.env` or `.env.development`:

```bash
# Enable remote OTLP telemetry to the local collector
OTEL_SERVICE_NAME=economic-dashboard-backend-dev
ENVIRONMENT=development
DEPLOYED_VERSION=0.1.0-dev

# Export traces via HTTP protobuf (port 4318) or gRPC (port 4317)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### Option B: Running Backend in Docker (`docker-compose.yaml`)
When the application runs in Docker, configure it to target host networking or the shared bridge network:

```yaml
services:
  app:
    environment:
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://host.docker.internal:4318"
```
Or attach the app container to `observability-net`:
```yaml
networks:
  observability-net:
    external: true
```

---

## Stopping the Observability Stack

```bash
# Stop containers while preserving volume data
docker compose -f observability/docker-compose.yaml down

# Or stop and clear persisted data volumes
docker compose -f observability/docker-compose.yaml down -v
```
