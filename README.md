# RINTIK frontend — operator dashboard

Static public UI plus a framework-free operator dashboard for the RINTIK v1
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

`predict.html` is the product workspace for the official replay. A daily click
retrieves the next hash-verified fixture, validates it, runs one calendar-day
ingest/run, persists the real frozen-model result, and—when the explicit demo
switch is active—records the separate synthetic physical-RH comparison for the
same timestamps. Batch mode automates at most 15 of those same sequential daily
cycles; it does not turn the model into one 15-day request or alter its rolling
window. `hasil.html` reads the authoritative stored day directly from the
backend. There is no file picker, arbitrary manual input, or silent fallback.

## Run the dashboard locally

For the final local Windows demo, use the ownership-safe launcher. It verifies
the frozen artifacts, dependencies, fixtures, database schema, and live
readiness before reporting success:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start_m5_demo.ps1 -ResetState
```

Open either URL printed by the script (public flow or operator dashboard;
defaults use frontend `4174` and backend `8140`). Stop only
the processes started by that launcher with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\stop_m5_demo.ps1
```

The reset flag deletes only the isolated ignored database under
`Prototipe/qa/runtime`; it never touches official inputs or the checkpoint.
For a manual development server, start the backend, then serve this directory:

```powershell
python -m http.server 4173
```

Open `http://127.0.0.1:4173/dashboard.html`. To use another local backend, add
`?api=http://127.0.0.1:8136`. Optional `&view=sensors` or `&view=settings`
opens a specific dashboard view.

The dashboard is now history and exploration rather than data entry. It
supports stored-day navigation, synchronized RH comparison, explicit synthetic
incident/recovery actions, CSV/audit export, a searchable unit-safe Sensor
Explorer, and a separate Settings / Technical Details view. Replay input and
simulation controls live on Prediksi.

## QA

From this repository:

```powershell
npm run stub:test
npm run contract:test
npm run public-flow:test
npm run product-flow:test
npm run product-flow-browser:test
npm run dashboard:test
```

The complete browser-operated 16-day rehearsal (clean demo database, frozen
model, screenshots, trace, exports, and local-network assertion) is:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run_m5_rehearsal.ps1
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

The protected home page remains byte-identical. Prediksi and Hasil use a
self-contained, offline-capable visual system and the final fail-closed daily
contracts. The product-flow browser suite is `npm run product-flow-browser:test`;
it records screenshots, network evidence, and a Playwright trace under
`Prototipe/qa/evidence/post-m5-product-flow`.
M4 browser acceptance and the tested-host M5 rehearsal pass. See
[`docs/MILESTONE_4_BROWSER_QA_20261010.md`](docs/MILESTONE_4_BROWSER_QA_20261010.md)
[`docs/MILESTONE_5_FINAL_READINESS.md`](docs/MILESTONE_5_FINAL_READINESS.md), and
[`docs/POST_M5_PRODUCT_FLOW_REDESIGN.md`](docs/POST_M5_PRODUCT_FLOW_REDESIGN.md).
Independent clean-machine portability is still explicitly unverified; local
prototype readiness is not a production-readiness claim.
