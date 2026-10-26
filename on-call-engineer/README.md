# Automated On-Call Engineer (`on-call-engineer/`)

The **On-Call Engineer** is an autonomous incident response service for the **Economic & Credit Risk Dashboard**. It monitors production and development services by polling the observability alert API every minute (default: 60s).

When an alert fires (such as `HighAPIFailureRate`, `CriticalAPIFailureRate`, or `APIFallbackActivationHigh`), it automatically structures the alert metadata, generates an incident dossier, and passes the incident details to a **headless coding agent** to investigate the codebase, diagnose root causes, and propose or apply fixes.

---

## Architecture Flow

```text
+------------------------------------+
|  Prometheus / Observability Stack  |
|      (Alert Rules Evaluation)      |
+------------------------------------+
                  |
         GET /api/v1/alerts (Every 60s)
                  v
+------------------------------------+
|       on-call-engineer/            |
|       (Observability Poller)       |
+------------------------------------+
                  |
     Alert Firing (Deduplicated)
                  v
+------------------------------------+
|      Agent Prompt Dispatcher       |
|  - Incident context & telemetry    |
|  - Runbook triage actions          |
|  - Codebase paths & test targets   |
|  - Saved to incidents/ archive     |
+------------------------------------+
                  |
            CLI Execution
                  v
+------------------------------------+
|       Headless Coding Agent        |
|  (e.g., agy -p / agy --print)     |
|  - Diagnoses failures              |
|  - Inspects BCRA / FX clients      |
|  - Checks fallback / cache         |
|  - Generates postmortem / fix      |
+------------------------------------+
```

---

## Directory Contents

```text
on-call-engineer/
├── README.md               # This documentation and runbook
├── config.py               # Configuration dataclass and environment variable parsing
├── poller.py               # Resilient Prometheus / Observability Alert API client
├── agent_dispatcher.py     # Prompt synthesis and headless agent subprocess runner
├── monitor.py              # Main monitoring loop and CLI entrypoint
├── run.sh                  # Execution shell script (Linux/macOS)
├── run.bat                 # Execution batch script (Windows)
├── incidents/              # Archived markdown dossiers for dispatched alerts
└── tests/
    └── test_on_call_engineer.py # Comprehensive unit and integration test suite
```

---

## How It Works

### 1. Alert Polling (`poller.py`)
- Connects to the observability alert API (`ALERT_API_URL`, default: `http://localhost:9090/api/v1/alerts`).
- Filters for alerts currently in the `firing` state (ignores `pending` alerts).
- Normalizes all standard alert labels (`service`, `environment`, `deployed_version`, `provider`, `owner`) and annotations (`summary`, `description`, `action`, `dashboard_url`, `runbook_url`).
- Computes deterministic SHA-256 fingerprints to track alert instances.

### 2. Deduplication & Cooldown (`monitor.py`)
- Tracks active alert dispatches in memory.
- If an alert remains firing across consecutive poll cycles, it respects `ALERT_COOLDOWN_SECONDS` (default: 300s = 5m) before re-dispatching an agent.
- When an alert clears/resolves in Prometheus, it is automatically purged from active tracking so subsequent occurrences are immediately caught.

### 3. Headless Coding Agent Dispatch (`agent_dispatcher.py`)
- Formats a comprehensive prompt containing:
  - Incident severity, name, service, environment, version, provider, and owner.
  - Alert trigger values and summary.
  - Recommended triage runbook actions and links.
  - Pointers to relevant repository files (`backend/app/clients/`, `backend/app/metrics.py`, `observability/prometheus/alert_rules.yaml`).
  - Clear diagnosis instructions for the AI coding agent.
- Archives the prompt to `on-call-engineer/incidents/incident_<timestamp>_<alertname>_<fingerprint>.md`.
- Invokes the headless agent via subprocess:
  ```bash
  agy --dangerously-skip-permissions --print "on-call-engineer/incidents/incident_XYZ.md"
  ```
  *(Or any custom agent command configured via `HEADLESS_AGENT_CMD`)*.

---

## Configuration Reference

The monitor is fully configurable via environment variables or CLI flags:

| Environment Variable | CLI Flag | Default | Description |
|---|---|---|---|
| `ALERT_API_URL` | `--alert-url` | `http://localhost:9090/api/v1/alerts` | Observability alert API endpoint |
| `POLL_INTERVAL_SECONDS` | `--interval` | `60` | Polling frequency in seconds (default: 1 minute) |
| `HEADLESS_AGENT_CMD` | `--agent-cmd` | `agy --dangerously-skip-permissions --print "{prompt_file}"` | Command template for headless coding agent |
| `ALERT_COOLDOWN_SECONDS` | N/A | `300` | Cooldown period before re-dispatching same firing alert |
| `AGENT_TIMEOUT_SECONDS` | N/A | `300` | Timeout in seconds for agent subprocess execution |
| `DRY_RUN` | `--dry-run` | `false` | Formats prompt and logs dispatch without running external agent |
| `LOG_LEVEL` | `--log-level` | `INFO` | Logging verbosity (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |

---

## Quickstart

### Continuous Monitoring (Every 1 Minute)
Run on Windows:
```cmd
on-call-engineer\run.bat
```

Or directly via Python:
```bash
python on-call-engineer/monitor.py
```

Run on Linux / macOS:
```bash
./on-call-engineer/run.sh
```

### Run a Single Poll Cycle (`--once`)
Ideal for cron jobs, CI pipelines, or immediate health validation:
```bash
python on-call-engineer/monitor.py --once
```

### Dry-Run Mode (Testing Without Spawning LLMs)
```bash
python on-call-engineer/monitor.py --once --dry-run
```

---

## Running the Automated Test Suite

Run all on-call tests:
```bash
pytest on-call-engineer/tests/ -v
pytest backend/tests/test_on_call_engineer.py -v
```

Run the entire project test suite:
```bash
pytest backend/tests/ -v -k "not test_docker_compose"
```
