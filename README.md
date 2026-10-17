# RINTIK frontend

Static, framework-free product interface for the RINTIK frozen-model backend.
Backend and contract failures are shown to the user and are never replaced by
sample or model-like predictions.

## Product pages

- `index.html` is the protected landing page. Final product work does not edit
  it or its shared `assets/css/style.css` and `assets/js/app.js` files.
- `predict.html` is the data-preparation and processing workspace.
- `hasil.html` explains the latest or selected daily humidity result.
- `dashboard.html` explores humidity history and exogenous sensor features.
- `settings.html` contains system and humidity-sensor inspections.
- `periksa.html` (Pemeriksaan Sensor) compares an uploaded humidity-sensor
  column with RINTIK estimates per day using the stateless `POST /monitor` of the
  frozen backend (rules `demo-v1`, thresholds illustrative and uncalibrated).
  Locally it calls the backend directly (`?api=` or port 8140); deployed it goes
  through the `api/monitor.js` proxy, which never falls back to a stub. The
  uploaded sensor column is a comparator, not ground truth, and results are not
  archived. It is separate from the archived synthetic monitoring in Settings
  (`/v1/demo/*`). Dates before the frozen context (29 Aug 2023 15:00) are rejected
  by the backend; `assets/data/demo_*.csv` samples are local-only and gitignored.

Prediksi has two explicitly isolated workflows:

1. **Operasional Harian** stores editable 30-minute readings for the
   deterministic 14-25 October 2026 synthetic scenario. Missing slots are
   filled only after an explicit action, manual rows are preserved, and daily
   inference remains disabled until all 48 slots exist.
2. **Demo Resmi** replays only the immutable 29 August-13 September 2023
   competition fixture, one date at a time or as 16 sequential daily runs.

Each workflow has its own progress, provenance, state, and confirmed reset.
There is no file picker and no silent fallback. Simulated physical humidity is
always separate from exogenous model input and from the RINTIK estimate.

Hasil is humidity-centric and shows P3, separately simulated physical sensor
readings, and any `estimated` recovery without merging their provenance.
Dashboard provides date ranges, unit-separated Sensor Explorer charts, and
descriptive temporal associations with sample-size and non-causality caveats.
Settings provides model/pipeline inspection, humidity-sensor inspection,
reversible browser-only threshold previews, and a separate independent accuracy
status.

## Run locally

The final Windows launcher verifies frozen artifacts, fixtures, dependencies,
database schema, and live readiness before printing the URLs:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start_m5_demo.ps1 -ResetState
```

Omit `-ResetState` to preserve the current demo database. The launcher verifies
both frozen-model health and the operational workflow endpoint; a live PID alone
is not considered ready. The standard browser origin on port 4174 remains
allowed when a temporary frontend port is used for QA.

Stop only its tracked processes with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\stop_m5_demo.ps1
```

For manual development, start the backend and serve this directory:

```powershell
python -m http.server 4173
```

Open `http://127.0.0.1:4173/predict.html`. To select another local backend,
append `?api=http://127.0.0.1:8136`.

## Safety modes

- `MODEL_MODE=remote` requires `MODEL_API_URL`; remote failure returns an error
  without predictions.
- `MODEL_MODE=demo_stub` is the only way to enable the legacy deterministic
  stub. It is explicitly labeled `source=explicit_demo_stub` and
  `simulation=true`.
- an unset or unknown legacy mode fails closed.

The final product pages use `lib/rintik-api.js` and the real backend contracts,
not the legacy stub. The official and operational namespaces remain isolated.

## QA

Static and integration checks:

```powershell
npm run contract:test
npm run public-flow:test
npm run product-flow:test
npm run dashboard:test
npm run integration:test
npm run runtime:smoke
```

`runtime:smoke` opens Prediksi through the managed Chromium/CDP session,
verifies migration from the legacy local API port 8000 to 8140, records real
HTTP responses and console errors, and writes evidence below
`Prototipe/qa/evidence/runtime-backend-recovery`.

The final browser-operated acceptance suite is:

```powershell
$env:RINTIK_FRONTEND_URL='http://127.0.0.1:4174'
$env:RINTIK_API_URL='http://127.0.0.1:8141'
npm run final-product-browser:test
```

It operates both namespaces and verifies manual persistence, explicit 48-slot
completion, missing-sensor recovery, exact 16-day/734-row official replay,
scoped resets, date-range persistence, keyboard focus, responsive layouts,
accessibility, and network/console health. Screenshots, a manifest, and a
Playwright trace are written below
`Prototipe/qa/evidence/final-product-experience`.

The protected landing page remains byte-identical. Prototype demo readiness is
not a production-readiness or field-validation claim.
