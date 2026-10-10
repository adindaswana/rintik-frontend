# Milestone 5 final readiness — 11 October 2026

## Decision

The RINTIK prototype is **PASS for a controlled local Grand Final demo on the
tested Windows host**. The end-to-end operator route starts from an empty
isolated database, loads the original frozen checkpoint, processes all 16
official test dates through the browser UI, demonstrates the explicitly
synthetic fault/recovery story, exports provenance-bearing evidence, survives a
page reload, and stops only launcher-owned processes.

Overall M5 portability remains **BLOCKED on one external acceptance item**:
the same procedure has not been executed on a second clean Windows machine.
This repository therefore does not claim clean-machine or production
readiness. The current machine used already-installed pinned dependencies.

## Delivered operational path

- `scripts/start_m5_demo.ps1`: checks port availability without killing an
  owner, runs preflight, starts backend/frontend hidden, validates live
  readiness, and records exact PID/start-time ownership.
- `scripts/stop_m5_demo.ps1`: stops only matching tracked PID/start-time pairs.
- `scripts/reset_m5_demo.ps1`: refuses reset while tracked services are alive
  and limits deletion to the isolated `Prototipe/qa/runtime` database.
- `scripts/run_m5_rehearsal.ps1`: clean reset → browser availability → start →
  full browser rehearsal → guaranteed service stop.
- `scripts/m5_demo_rehearsal.js`: uploads all daily fixture files through the
  real UI, asserts the expected story, captures screenshots/trace/exports, and
  fails if the browser makes any non-loopback request.

Default ports are 8140/4174 because 8000/4173 were already owned during the
final QA run. The launcher correctly refused to replace those owners. Ports
remain configurable parameters.

## Critical correction found by final visual review

The outage card previously rendered a fully missing synthetic physical sensor
as `0.0%`. JavaScript's numeric conversion treats `null` as zero. The mean
helper now excludes `null`, `undefined`, and empty strings before conversion.
The UI displays `Tidak tersedia` with `data hilang · simulasi · bukan ground
truth`; the M5 browser harness asserts both texts. No model, formula, API,
database schema, or official fixture changed.

## Executed end-to-end evidence

Final evidence directory:
`Prototipe/qa/evidence/m5-final-readiness/20261011-020518/`

- browser rehearsal: PASS, 16 dates, 734 rows;
- total browser-operated replay: 64.635 seconds;
- backend ready in the final rehearsal: 17.185 seconds;
- external browser requests: 0;
- browser console/page errors: 0;
- screenshots: 10, covering clean empty, 18/48 partial, normal, stuck,
  outage/restricted, estimated recovery, repaired, 44/48 final, technical
  lineage, and reload persistence;
- exports: final-day CSV and audit JSON, both checked for real-model and
  synthetic provenance;
- trace: `m5-recorded-demo-trace.zip`, SHA256
  `72c651cea26be8b88649c341a119d526a154c8806a7476278d5f072622dea2d4`;
- result manifest SHA256:
  `1788242ce61a0e94b08af0e9d298e9f1db7495c7e366e2a93e4cce6f889d6d6a`;
- final 16-file evidence manifest: zero checksum mismatches, SHA256
  `233b4e48eeabab1c783e8a35d6af48dbe9103e5302199dbe27b1ab8bb2befb59`.

Video was not recorded because the local Playwright runtime lacks its separate
FFmpeg binary and the rehearsal must remain offline. This is not represented
as a video PASS. Ten real screenshots plus the complete Playwright trace are
the recorded-demo backup and carry an explicit synthetic/field-validation
disclaimer.

## Regression evidence after the UI correction

| Verification | Result |
|---|---|
| backend unit/regression suite | PASS, 21/21 in 108.954 s |
| sidecar deterministic check | PASS, exact SHA256 |
| M1 verifier | PASS, 734/734 at 4 dp; max/mean error 0 |
| M2 verifier | PASS, prefix/window parity 0; restart/idempotency/snapshots true |
| M3 verifier | PASS, 734 synthetic rows isolated; gates/recovery intact |
| frontend stub/contract/dashboard checks | PASS |
| real HTTP integration replay | PASS, 16 days/734 rows/23 features/48 recovery/export rows |
| M4 browser regression | PASS, 15/15 including responsive, keyboard, fail-closed, AX tree, and axe |
| final M5 browser rehearsal | PASS, 16 UI uploads and complete story |

## Honest limits

- The independent clean-Windows-machine run is BLOCKED until a second host is
  available. Exact pinned dependency validation reduces, but does not replace,
  that test.
- The application is local-only and is not validated for field data, multiple
  operators, production concurrency, or cloud deployment.
- Synthetic RH, incidents, audit actions, thresholds, Model Health, and Trust
  Score are illustrative. They do not prove sensor-fault precision/recall or
  field accuracy.
- Rolling 15 calendar days is the product adapter and has no claimed NSC
  leaderboard score. The submission checkpoint/formulas remain frozen.
- Real iOS/Android hardware touch behavior remains untested; browser viewport
  and keyboard acceptance are proven separately in M4.

## Venue procedure

1. Before the venue goes offline, install the exact Python requirements and
   verify Chrome/Edge plus Node are present.
2. Run `start_m5_demo.ps1 -ResetState`; do not continue unless it prints the
   real model hash and readiness success.
3. Open the printed dashboard URL and follow
   `Prototipe/demo/DEMO_STORYBOARD.md`.
4. If live operation fails, show the evidence screenshots/trace explicitly as
   a **recorded demo**; never call them live measurements.
5. Run `stop_m5_demo.ps1` after the session.
