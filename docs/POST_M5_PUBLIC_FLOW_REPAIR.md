# Post-M5 public prediction flow repair

Date: 11 October 2026
Status: **PASS on the tested Windows host**

## Root causes proven

The public page posted JSON to relative `/api/predict`. The final local launcher
serves the frontend with Python `http.server`, which is static and cannot run
the Vercel-style `api/predict.js` function.

Direct reproduction against port 4173 produced two payload-dependent failures:

- official 734-row request: socket reset (`ECONNRESET`), surfaced by fetch as
  `Failed to fetch`; Python's static handler rejects POST without consuming the
  large request body;
- legacy 96-row generated example: HTTP 501, `Content-Type: text/html`, body
  beginning `<!DOCTYPE HTML>`; `app.js` called `res.json()` unconditionally,
  exposing `Unexpected token '<'`.

This was not an inference failure. Neither request reached FastAPI. The public
CSV check also inspected only `datetime`, `air_temperature`, and `co2`, marked
preview rows “Baik”, and generated an unsupported synthetic 96-row example.

## Repair

- Public pages now use `lib/rintik-api.js` with `?api=`, session storage, then
  localhost default—the same base URL strategy as the operator dashboard.
- `lib/public-prediction.js` provides quote-aware bounded CSV parsing, exact
  25-column/schema checks, strict half-hour chronology, duplicate detection,
  and explicit workflow classification.
- A single official date (18/48/44 rows) uses ingest → run → separately labeled
  synthetic-demo monitor. It persists to the same backend state read by the
  operator dashboard.
- The exact 734-row official fixture uses `/predict`. Backend hash verification
  is authoritative; this route is stateless and labeled as compatibility, not
  daily replay.
- “Contoh Data Resmi” calls `GET /v1/demo/official-input/next`, which rechecks
  official source/day hashes and returns input only (`prediction_produced=false`).
- Arbitrary manual input is explicitly unsupported instead of being expanded
  with fabricated defaults.
- Timeout, network, non-JSON, 4xx/5xx, out-of-order, and hash mismatch errors
  are fail-closed and actionable. Failed attempts clear the public result and
  focus/scroll the visible alert. Duplicate submit is suppressed.
- The result page states whether data is persisted daily or stateless 734-point
  compatibility. CSV download includes source, simulation flag, and workflow.

## Browser/network evidence

Final evidence:
`Prototipe/qa/evidence/post-m5-public-flow/20261011041317`

- 16/16 checks PASS;
- 8 screenshots, 116 network entries, and real Chromium trace;
- trace SHA256:
  `c0d7e17f7af0bb1bc78bcb1e565999458590ad8ae6f3f93101b80fa9de7ddb61`;
- example daily flow: GET fixture 200, ingest 200, run 200, monitor 200;
- same-day retry stayed at one completed day;
- out-of-order day returned JSON 409 and no stored result;
- wrong API returned HTML 404 but UI reported explicit non-JSON backend error;
- unreachable API failed without fallback;
- altered 734 rows were rejected by the backend hash gate;
- exact 734 rows returned real model output and left daily completed count at 1;
- mobile 390×844 had no horizontal overflow;
- model/state hashes remained exact and no unexpected console error occurred.

## Regression evidence

- backend unit/API: 24/24 PASS;
- M1 verifier: 734/734 identical at 4 dp, max/mean difference 0;
- M2 verifier: 16 dates/734 rows, prefix/post parity 0, restart/idempotency and
  snapshot immutability PASS;
- M3 verifier: 734 synthetic rows separate, three incidents, 48 estimated
  recovery rows, no synthetic accuracy metric;
- frontend contract/public/dashboard tests: PASS;
- real HTTP integration: 16 days, 734 rows, 23 features, 48 recovery rows PASS;
- M4 browser regression: 15/15 PASS;
- M5 clean-state browser rehearsal: 16/16 dates, 734 rows, PASS. Evidence:
  `Prototipe/qa/evidence/m5-final-readiness/20261011-111425`.

The checkpoint, sidecar, inference formulas, official CSVs, and submission were
not modified. This remains a controlled local prototype, not arbitrary field
ingestion or production readiness.
