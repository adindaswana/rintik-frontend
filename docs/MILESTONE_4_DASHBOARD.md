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
| Computer Use browser inventory | BLOCKED | no browser/app surface was available |
| Local Chrome/Edge headless screenshots | BLOCKED | host sandbox denied browser Mojo/Crashpad startup; no screenshot evidence was produced |

## Acceptance decision

Implementation, data integrity, accessibility-static checks, and real HTTP
integration pass. M4 as a whole is **BLOCKED, not PASS**, because responsive
visual review at 1440/1366/tablet/mobile widths and live keyboard interaction
could not be executed in this environment. Those checks must be run on a
browser-capable host before proceeding on the assumption that M4 is fully
accepted.

This blocker does not indicate a known functional failure, but it is a missing
required evidence class. No screenshot or accessibility result is fabricated.
