# RINTIK frontend — integration foundation

Static legacy UI plus a framework-free client for the RINTIK v1 backend. The
Milestone 3 change is deliberately limited to contract reliability: backend
errors are surfaced and never replaced by sample/model-like predictions.

## Safety modes

- `MODEL_MODE=remote` requires `MODEL_API_URL`; remote failure returns an error
  without predictions.
- `MODEL_MODE=demo_stub` is the only way to enable the legacy deterministic
  stub. Its response is explicitly marked `source=explicit_demo_stub` and
  `simulation=true`.
- an unset or unknown mode fails closed.

The daily product API is exposed through `lib/rintik-api.js`, including the
separate `/v1/demo` monitoring namespace. The M3 HTTP integration test uses
that client directly; connecting it to the final dashboard is M4 scope.

## QA

From this repository:

```powershell
npm run stub:test
npm run contract:test
```

For a real cross-repository smoke test, start the backend with a clean runtime
database, then run:

```powershell
$env:RINTIK_API_URL='http://127.0.0.1:8000'
npm run integration:test
```

The integration script replays all 16 official dates, checks 734 model-backed
rows, the synthetic stuck/outage/repaired scenario, explicit simulated
confirmation, and recovery provenance. It does not perform deployment or
visual dashboard QA.

## Current scope

The existing public pages remain legacy UI. Milestone 3 removes silent fake
results from their real-model path, but the operator dashboard, Sensor Explorer,
and Settings / Technical Details redesign are intentionally deferred to M4.
