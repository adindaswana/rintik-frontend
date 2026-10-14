# RINTIK Final Product Experience — 14 October 2026

Status: **PASS for the tested local scientific prototype scope**. This is not a
production-readiness or field-validation claim.

## Product structure delivered

- Prediksi has two isolated roots: Operasional Harian (synthetic October 2026)
  and Demo Resmi (official 2023 competition fixture).
- Hasil is the humidity-centric continuation for a selected completed date.
- Dashboard explores stored ranges, exogenous sensor series by unit, and
  descriptive temporal associations.
- Settings / Technical Details is a standalone inspection page.
- `index.html`, `assets/css/style.css`, and `assets/js/app.js` remain
  byte-identical to the protected baseline.

## State and scientific boundaries

Operational simulation data is deterministic and explicitly non-field data.
Manual rows and synthetic-fixture rows retain separate source labels. Filling
missing slots is explicit, inference requires 48/48 rows, and the 12-day period
does not claim to reach the rolling-15 transition.

The official demo remains exactly 16 dates and 734 observations: 18 rows on the
first date, 48 on each middle date, and 44 on the last date. Its state, reset,
and fixtures are independent from operational simulation.

Physical humidity simulation occurs after model inference and is not a feature.
On a missing-sensor scenario, raw physical values remain null; recovery is
stored and displayed separately as `estimated`, equal to P3. Temporal insights
are descriptive associations, not causality or accuracy validation. Trust Score
for the new 2026 scenario is withheld because no calibrated drift baseline or
independent humidity reference exists.

## Browser evidence

Evidence directory:
`Prototipe/qa/evidence/final-product-experience/20261014051410/`

The Playwright/CDP run produced 16 screenshots, `manifest.json`, and
`trace.zip`. All 16 checks passed, including:

- manual reading persistence and explicit fixture completion;
- model-backed daily processing and missing-sensor recovery;
- Hasil, Sensor Explorer, and Temporal Insights;
- model/sensor inspection and reversible threshold preview;
- guided 6 September recovery;
- exact 16-day/734-row official replay;
- explicit two-day Dashboard range persistence;
- scoped resets and keyboard focus behavior;
- zero console errors and zero HTTP 5xx responses.

Responsive evidence covered 1425 px desktop, 753 px tablet, and 375 px mobile
content widths with no horizontal overflow. Accessibility-tree checks found no
unnamed interactive controls on Prediksi, Hasil, or Dashboard.

## Regression evidence

- Backend: `python -m unittest discover -s tests -v` — 29/29 PASS.
- Final browser acceptance: `npm run final-product-browser:test` — 16/16 PASS.
- Clean and live preflight both PASS, including the operational fixture hash,
  576 rows/12 dates, all isolated tables, and live namespace readiness.
- Frozen checkpoint SHA256 remains
  `adce8fda2f465679ea6e8fe31124822a45a555b9dc154e12076ef5b6140699b0`.
- Operational fixture SHA256 is
  `d311ff980a0043b14311b6d7e20fc04ca69ef09c34127a6594bee3fa48953da6`.

## Known limits

- October 2026 inputs and physical humidity are synthetic demonstrations, not
  greenhouse measurements or accuracy evidence.
- Threshold previews are illustrative, uncalibrated, browser-local what-if
  controls and do not rewrite historical diagnosis.
- Correlation and lead/lag views are exploratory and cannot establish cause.
- No independent trustworthy humidity reference is present, so RMSE/MAE is not
  shown for the synthetic operational scenario.
