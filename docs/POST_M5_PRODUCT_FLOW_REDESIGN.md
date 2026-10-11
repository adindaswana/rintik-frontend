# Post-M5 product-flow redesign

Date: 11 October 2026
Status: PASS on the tested Windows host

## Outcome

Prediksi is now the single replay workspace. One click represents one complete
acquisition cycle: official exogenous sensor features are retrieved and sent to
the frozen RINTIK pipeline, its daily snapshot is persisted, and the separate
synthetic physical-RH series is obtained for the same timestamps when demo
monitoring is enabled. Hasil is a direct continuation that reads the stored
backend result. Dashboard is reserved for history, monitoring, Sensor Explorer,
exports, and technical details.

The 15-day control is an automation of up to 15 chronological one-day cycles.
It is explicitly not the model's rolling-window mechanism. Day 16 still uses
the verified rolling 15 calendar-day internal context.

## Product and integrity decisions

- No file picker or arbitrary manual feature form remains in the active flow.
- Official fixtures come only from `GET /v1/demo/official-input/next` and are
  classified before ingest/run.
- Real model P3, synthetic physical RH, and recovery-estimated values remain
  separate in copy, chart legends, API calls, and persisted provenance.
- The fault schedule uses the existing M3 synthetic fixture: 4–5 September
  stuck, 6 September outage, 7 September onward simulated repair.
- Recovery uses the existing audit and explicit demo-confirmation gates. The
  outage's raw sensor values remain null.
- Backend or network failure is fail-closed and does not render substitute
  results.
- `index.html`, `assets/css/style.css`, and `assets/js/app.js` were not edited.
  Prediksi/Hasil use a self-contained local stylesheet so clean rehearsal makes
  no external font requests and the protected home is unaffected.

## Browser evidence

Final evidence: `qa/evidence/post-m5-product-flow/20261011125729/`

- 10/10 browser checks PASS.
- 9 real Chromium screenshots: daily result, Hasil continuity, 15-day batch,
  outage/recovery, mobile Hasil, tablet/mobile Prediksi, input-free Dashboard,
  and fail-closed backend outage.
- 16 completed dates and 734 archived `pred_internal` rows.
- Desktop 1440×900, tablet 768×1024, and mobile 390×844 have no horizontal
  overflow or duplicate IDs.
- Trace SHA256:
  `2b41fd98d96bd97ec883fc47d806eadc52fdf5c97b1e3aa4589b3c1f1095629f`.
- The only console network errors are the deliberately unreachable port 8999
  failure scenario; no fake result appears.

Final M5 rehearsal regression:
`qa/evidence/m5-product-flow-regression/202610111303/`

- PASS, 16/16 dates, 734/734 rows, total browser-operated elapsed time
  40.659 seconds.
- Zero non-loopback browser requests after removing the product-flow dependency
  on the legacy Google Fonts import.

## Regression evidence

- Backend unit/regression: 24/24 PASS in 119.041 seconds.
- M1 verifier: PASS; official 734-row parity max/mean absolute difference 0.
- M2 verifier: PASS; chronology, no-lookahead, window parity, snapshot
  immutability, restart, and idempotency.
- M3 verifier: PASS; 734 synthetic rows separate, three incidents, recovery
  estimated, raw outage preserved as null, and audit gates enforced.
- Frontend dashboard, API contract, public-flow, product-flow, and explicit
  stub tests: PASS.

## Protected hashes

- Frozen checkpoint:
  `adce8fda2f465679ea6e8fe31124822a45a555b9dc154e12076ef5b6140699b0`
- Inference sidecar:
  `a24da3473bf42a10fb9bde05e37495e5b69adffde9193dd4648daa9e0898996e`
- Protected home:
  `f538d30ea4ee70d4cccc325a80e7eb36a5e3734e88f223c9ea3fc659d9d121da`
- Shared home CSS:
  `fc3dbbbc64beb45e8856909396270daf295b190781d28a4394ca3653210ed262`
- Shared home JavaScript:
  `d4b8719613da03e12ebde800ccd648e393463789fe781ab9606770352e041bc8`

## Scope and remaining limitation

This establishes tested local prototype readiness, not field validation or
production readiness. Physical RH is synthetic demonstration data and is not a
ground-truth accuracy measurement. Fault thresholds and trust indicators remain
illustrative until empirically calibrated. Independent clean-machine execution
outside the tested Windows host remains unverified.
