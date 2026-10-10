# Milestone 4 dashboard implementation and QA

Test date: 10 October 2026

Baseline: `4eadab7` on `feature/nsc-final-system-integration`

## Product behavior implemented

- Operator overview with service readiness, stored-day navigation, partial-day
  completeness, real P3 summary, explicit synthetic physical RH, verdict,
  incident status, recovery gate, and audit timeline.
- Chronological daily run console for one CSV date at a time. Ingest, frozen
  inference, and synthetic monitoring are separate visible steps; failures do
  not generate replacement output.
- Synchronized SVG RH chart with distinct solid model, dashed synthetic sensor,
  and dotted estimated-recovery series, plus tooltip, keyboard point traversal,
  range controls, and an alternate data table.
- Sensor Explorer with search, group disclosure, persistent selection,
  clear/reset, null gaps, synchronized range, and separate panels by unit.
- Settings / Technical Details containing run lineage, exact hashes, window
  context, illustrative health components, simulated audit state, recovery
  gate controls, and diagnostic JSON.
- Provenance-rich CSV and audit JSON exports. Synthetic data is never called
  ground truth or accuracy evidence.
- Loading, empty, backend-unavailable, invalid-bundle, restricted-gate, and
  missing-monitoring behavior. The dashboard contains no sample-series
  generator.

No frontend framework or runtime dependency was introduced. Interaction motion
is limited to short transform/opacity feedback, uses explicit properties, and
honors `prefers-reduced-motion`.

## Executed QA

| Check | Status | Evidence |
|---|---|---|
| `node --check assets/js/dashboard.js` | PASS | JavaScript syntax |
| `node --check lib/dashboard-data.js` | PASS | helper syntax |
| `npm run stub:test` | PASS | legacy demo stub remains deterministic, bounded, and explicit |
| `npm run contract:test` | PASS | 8 API calls; fail-closed network/error handling; explicit demo namespace |
| `npm run dashboard:test` | PASS | CSV parsing, null-gap segmentation, unit grouping, formula safety, bundle provenance/alignment, unique IDs, valid `for`/`aria-controls`, named buttons, reduced motion, and no sample generator |
| `npm run integration:test` against a clean real backend | PASS | 16 days; 734 rows; 23 features; stuck/outage/repaired; 48 estimated recovery rows; 48 export rows |
| Backend restart and read-back | PASS | persisted 16 completed/monitored days; series and export still available |
| Computer Use browser inventory | NOT USED | native surface remained unavailable; host Chrome was controlled safely through launcher-owned localhost CDP |
| Autonomous Chrome browser suite | PASS | 15 checks; exact desktop/tablet/mobile screenshots, keyboard trace, error/empty/restricted/loading/motion/console/accessibility evidence |

## Acceptance decision

The original browser blocker is closed. M4 is **PASS** after autonomous Chrome
QA produced exact desktop/tablet/mobile captures, a live keyboard trace,
failure/empty/restricted/loading/reduced-motion evidence, responsive geometry,
console logs, Chromium accessibility-tree output, and axe-core results across
all three product tabs. Accessibility findings discovered during this run were
fixed and the full browser suite passed again.

See
[`MILESTONE_4_BROWSER_QA_20261010.md`](MILESTONE_4_BROWSER_QA_20261010.md)
for the final evidence, corrections, regression results, tooling substitution,
and remaining M5 boundaries.

## Browser evidence continuation — 10 October 2026

One real Windows-browser screenshot of the first partial day was received and
corroborated against the live API. It exposed a major chart-width defect caused
by rendering while the Overview panel was hidden, plus an operator-language
defect where a no-incident day displayed a restricted recovery gate. Both were
corrected, together with tighter provenance labels and safer next-day workflow.

All automated frontend checks, the 21-test backend suite, sidecar verification,
and a fresh 16-day real-HTTP integration replay pass after the corrections.
The screenshot predates the fixes and is 1918×826 rather than a required exact
viewport. It was superseded by the exact after-fix automated browser evidence.
See [`MILESTONE_4_VISUAL_REVIEW_20261010.md`](MILESTONE_4_VISUAL_REVIEW_20261010.md)
for the first review and the browser-closure document above for the final
decision.
