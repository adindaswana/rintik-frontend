# RINTIK Product Experience Overhaul — 13 October 2026

## Outcome

Prediksi now has one simple root with two branches:

1. **Operasional Harian** processes and stores the next available day.
2. **Demo 16 Hari** runs the pinned demonstration period, exposes reset, and provides one reliable 6 September sensor-outage action.

Hasil presents the latest day. Dashboard presents the same information with history, sensor exploration, incidents, audit, and technical details. The manual sensor form remains available as a secondary disclosure and never pretends that one reading is a valid daily inference batch.

When the humidity sensor is unavailable, the user-facing operational series uses the RINTIK estimate. The immutable raw sensor record remains a gap and the replacement source stays explicit. The product therefore provides continuity without corrupting provenance.

## Evidence-based design review

| Before | After | Why |
|---|---|---|
| Daily, batch, and manual input competed as three primary modes. | Two primary modes: Operasional Harian and Demo 16 Hari. Manual input is an expandable secondary tool. | The main decision now mirrors the user's actual goal: routine use or jury demonstration. |
| Progress `0/16` was always visible and made the whole product appear limited to 16 days. | The 16-day counter exists only inside Demo mode. Operasional Harian simply processes the next available sensor day or waits for new data. | Sixteen days is a demo-fixture boundary, not the product's primary mental model. |
| “Periksa ulang status sistem” refreshed state without visible success feedback. | The redundant control is removed; status synchronizes on load and after every action. | A no-op-looking button adds cognitive load without advancing the task. |
| Recovery was exposed through multiple controls with hidden prerequisites. | One “Tampilkan kerusakan sensor 6 Sep” action prepares missing dates chronologically, runs monitoring, confirms the demo incident, and opens the result. | One action now has one clear, observable outcome. |
| Result cards exposed implementation terms and separate raw/recovery values as the primary story. | Primary cards show Prediksi RINTIK, Data operasional, readings, and sensor status. Technical lineage remains in Settings / Technical Details. | Operators need to understand availability and source, not pipeline internals. |
| A disconnected sensor left the user to infer what value the application would use. | Data operasional equals the RINTIK prediction during the outage, with a clear replacement banner. Raw sensor gaps remain auditable. | This matches the continuity concept while preserving scientific integrity. |
| Changed CSS/JS could be reused from an old browser cache. | Page-specific assets use an explicit version query. | Reloading the page now reliably requests the current product flow. |
| Dashboard controls overlapped at the 768 px tablet viewport. | The workspace bar stacks navigation and export actions below 820 px. | Tablet controls remain readable and non-overlapping. |

## Verification

Final product browser run: **PASS — 12/12 checks, 10 screenshots, no unexpected console errors**.

Evidence: `../qa/evidence/product-overhaul/20261013185443/`

The run proves:

- two-mode hierarchy and removal of legacy controls;
- manual form availability and non-persistence;
- real one-day processing and navigation to Hasil;
- chronological preparation of the 6 September outage;
- raw sensor remains a gap while every replacement value equals `post_3` within `1e-10`;
- Hasil and Dashboard show the correct operational source;
- the complete demo still replays all 16 dates and archives all 734 predictions;
- desktop/mobile layout, keyboard mode selection, and Chromium accessibility trees;
- explicit reset to 0 completed days; and
- fail-closed behavior when the backend is unavailable.

M4 browser regression: **PASS — 15/15**, including tablet layout, drawer keyboard flow, loading, empty, error, audit-restricted, and reduced-motion states.

Backend regression: **PASS — 25/25 unit/integration tests**. Independent M1, M2, and M3 verifiers all PASS. M1 numerical parity remains 734/734 at four decimals with maximum absolute difference `0.0`.

## Protected invariants

- `index.html` SHA256 remains `f538d30ea4ee70d4cccc325a80e7eb36a5e3734e88f223c9ea3fc659d9d121da`.
- Shared home assets remain unchanged.
- Model SHA256 remains `adce8fda2f465679ea6e8fe31124822a45a555b9dc154e12076ef5b6140699b0`.
- Sidecar SHA256 remains `a24da3473bf42a10fb9bde05e37495e5b69adffde9193dd4648daa9e0898996e`.
- No model, formula, official fixture, or backend source was changed.
- Final live demo state was reset to 0/16.

## Product boundary

Demo mode contains the 16 official dates. Operasional Harian does not describe the system as ending on day 16; it waits for the next validated sensor input. This prototype still does not fabricate a seventeenth day or claim an unimplemented live-IoT connector.

The physical humidity stream and fault scenario are demonstration data, not field validation. This label remains visible where it affects interpretation, while engineering details stay out of the primary flow.
