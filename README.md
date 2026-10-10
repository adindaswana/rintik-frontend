# RINTIK frontend — operator dashboard

Static legacy UI plus a framework-free operator dashboard for the RINTIK v1
backend. Backend errors are surfaced and never replaced by sample/model-like
predictions.

## Safety modes

- `MODEL_MODE=remote` requires `MODEL_API_URL`; remote failure returns an error
  without predictions.
- `MODEL_MODE=demo_stub` is the only way to enable the legacy deterministic
  stub. Its response is explicitly marked `source=explicit_demo_stub` and
  `simulation=true`.
- an unset or unknown mode fails closed.

The daily product API is exposed through `lib/rintik-api.js`, including the
separate `/v1/demo` monitoring namespace. `dashboard.html` consumes the real
daily result, synthetic monitoring, and official input series as one validated
bundle. Any source, simulation, date, row-count, or timestamp mismatch fails
closed.

## Run the dashboard locally

Start the backend, then serve this directory over HTTP:

```powershell
python -m http.server 4173
```

Open `http://127.0.0.1:4173/dashboard.html`. To use another local backend, add
`?api=http://127.0.0.1:8136`. Optional `&view=sensors` or `&view=settings`
opens a specific dashboard view.

The dashboard supports chronological one-day upload/run/monitor, stored-day
navigation, synchronized RH comparison, explicit synthetic incident/recovery
actions, CSV/audit export, a searchable unit-safe Sensor Explorer, and a
separate Settings / Technical Details view.

## QA

From this repository:

```powershell
npm run stub:test
npm run contract:test
npm run dashboard:test
```

For a real cross-repository smoke test, start the backend with a clean runtime
database, then run:

```powershell
$env:RINTIK_API_URL='http://127.0.0.1:8000'
npm run integration:test
```

The integration script replays all 16 official dates, checks 734 model-backed
rows, 23 catalog features and per-day input series, the synthetic
stuck/outage/repaired scenario, explicit simulated confirmation, recovery
provenance, and the 48-row outage CSV export.

## QA status and scope

The existing public pages remain legacy UI and link to the operator dashboard.
Static accessibility/contract tests, full cross-repository HTTP replay, and
backend regressions pass. Browser screenshot, responsive visual, and live
keyboard QA are still required on a browser-capable host before M4 can be
declared fully accepted. See [`docs/MILESTONE_4_DASHBOARD.md`](docs/MILESTONE_4_DASHBOARD.md).
