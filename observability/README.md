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
│   ├── prometheus.yaml             # Prometheus scrape target configurations
│   ├── alert_rules.yaml            # Actionable Prometheus alerting rules
│   └── test_alert_rules.yaml       # Promtool unit tests for alerting rules
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

# Export traces and metrics via HTTP protobuf (port 4318) or gRPC (port 4317)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### Option B: Connecting Containerized Development (`docker-compose.dev.yaml` / `docker-compose.yaml`)
The development compose stack attaches `app-dev` to the external `observability-net` bridge network and routes telemetry to the collector:

```yaml
services:
  app-dev:
    environment:
      OTEL_SERVICE_NAME: economic-dashboard-backend-dev
      ENVIRONMENT: development
      DEPLOYED_VERSION: 0.1.0-dev
      OTEL_EXPORTER_OTLP_ENDPOINT: http://observability-otel-collector:4318
    networks:
      - app-network-dev
      - observability-network-dev

networks:
  app-network-dev:
    driver: bridge
  observability-network-dev:
    name: observability-net
    external: true
```

### Option C: Connecting Containerized Production (`docker-compose.prod.yaml`)
The production compose stack maintains complete database, port, and network isolation from development while seamlessly connecting `app-prod` to `observability-net`:

```yaml
services:
  app-prod:
    environment:
      OTEL_SERVICE_NAME: economic-dashboard-backend-prod
      ENVIRONMENT: production
      DEPLOYED_VERSION: 0.1.0
      OTEL_EXPORTER_OTLP_ENDPOINT: http://observability-otel-collector:4318
    networks:
      - app-network-prod
      - observability-network-prod

networks:
  app-network-prod:
    driver: bridge
  observability-network-prod:
    name: observability-net
    external: true
```

---

## Alerting & Incident Response (API Failures)

The observability stack includes automated, actionable alerts for external and backend financial API failures configured in `observability/prometheus/alert_rules.yaml`.

### 1. Alert Architecture & Rationale

| Alert Name | Severity | Threshold | Duration | Rationale (Real User Impact) |
|---|---|---|---|---|
| `HighAPIFailureRate` | `critical` | `> 10%` error rate | `5m` | Sustained error rate over 10% directly impacts real users by failing debtor risk evaluations, currency rate checks, and monetary series updates. The 5m window eliminates noise from transient gateway restarts or single network timeouts. |
| `CriticalAPIFailureRate` | `page` | `> 50%` error rate | `2m` | Severe API outage where the majority of outbound financial requests fail immediately. Requires immediate incident mitigation. |
| `APIFallbackActivationHigh` | `warning` | `> 0.05` events/s | `5m` | Indicates persistent failure to reach live providers, forcing silent fallback to synthetic mock data. |

### 2. Standardized Alert Context & Metadata

Every alert carries comprehensive diagnostic labels and annotations:
- `service`: Target microservice (`{{ $labels.service_name }}`)
- `environment`: Deployment tier (`development`, `production`, etc.)
- `deployed_version`: Deployed release version (`{{ $labels.deployed_version }}`)
- `owner`: Responsible engineering team (`financial-data-platform-team`)
- `dashboard_url`: Direct link to Grafana dashboard with active filters pre-populated (`http://localhost:3000/d/economic-dashboard-overview?var-environment=...`)
- `action`: Prescriptive triage and runbook steps for on-call responders.

### 3. Incident Response Runbook (API Failures)
1. **Open Dashboard:** Click `dashboard_url` to inspect request throughput, error codes, and fallback rates.
2. **Verify Upstream Status:** Confirm whether BCRA (`api.bcra.gob.ar`) or DolarApi (`dolarapi.com`) are undergoing scheduled maintenance or outages.
3. **Inspect Logs & Traces:** Jump to Loki in Grafana using trace IDs to see underlying HTTP client exceptions (e.g., SSL certificate errors, timeouts).
4. **Fallback & Cache Health:** Verify SQLite `cuit_cache` and synthetic fallbacks are serving cached records to end users.

---

## Stopping the Observability Stack

```bash
# Stop containers while preserving volume data
docker compose -f observability/docker-compose.yaml down

# Or stop and clear persisted data volumes
docker compose -f observability/docker-compose.yaml down -v
```
