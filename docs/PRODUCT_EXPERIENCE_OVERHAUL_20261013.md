# RINTIK Product Experience Overhaul — 13 October 2026

## Outcome

The public prediction flow and Dashboard now behave as one repeatable product journey without changing `index.html`, the shared home assets, the frozen checkpoint, the verified sidecar, or any mathematical stage.

The verified journey is:

1. Beranda → Prediksi;
2. inspect the 23-feature manual form without inference or persistence;
3. process one official calendar day;
4. continue naturally to Hasil;
5. prepare the 6 September recovery scenario from official fixtures in chronological order;
6. finish the remaining official fixture dates;
7. explore history through the unified Dashboard shell;
8. reset runtime demo state explicitly; and
9. start again from 29 August 2023.

## Evidence-based findings and repairs

| Before | After | Why |
|---|---|---|
| Reset was a small control beside the progress bar. | Completion state presents a primary, explicit “Ulangi demo dari awal” action, while partial runs retain “Reset progres demo” with confirmation. | Re-running the demonstration is a core operator task, not an incidental utility. |
| `16 / 16` visually resembled a model lifetime limit. | A completion panel distinguishes the 16-day official fixture, the 15-calendar-day internal rolling context, and the requirement for a separately validated operational ingestion adapter for new dates. | The prototype must not invent day 17 or imply unsupported general-purpose ingestion. |
| Recovery could update the correct data and then scroll focus back to the alert, making the action appear ineffective. | Recovery feedback is announced without stealing the viewport; focus and scroll land on the 6 September result and estimated recovery chart. | The visible outcome must match the button promise. |
| The 6 September scenario required the user to know and manually satisfy hidden prerequisites. | “Siapkan & buka recovery 6 Sep” processes only verified official daily fixtures up to 6 September, monitors 4–6 September, confirms the explicitly simulated incident, and opens the result. | This creates a reliable jury-demo path while retaining chronology, provenance, and real model execution. |
| Dashboard used a permanent 276 px application sidebar and a different page geometry. | Dashboard uses the same 1240 px product container, top navigation, card language, and typography as Prediksi/Hasil; internal views live in an off-canvas drawer. | Dashboard remains an exploration workspace while feeling like the same RINTIK product. |
| Dashboard internal navigation occupied permanent space and became a horizontal block on mobile. | The drawer is closed by default, keyboard-focusable, focus-trapped, dismissible by Escape/backdrop, and honors reduced motion. | It preserves screen space and gives desktop/mobile the same interaction model. |

## Root causes

- Reset persistence was correct in the backend, but its visual priority did not match the demonstration workflow.
- The official fixture adapter intentionally ends after 16 dates. The previous copy exposed the end state without explaining the difference between fixture availability and rolling model context.
- `applyRecovery()` called `scrollIntoView()` on the result and then called `setAlert()`, whose own `scrollIntoView()` pulled the viewport back to the control column.
- The earlier Dashboard architecture treated internal navigation as the page shell. Prediksi and Hasil instead treated global product navigation as the shell.

## Integrity boundary

- Official checkpoint SHA256 remains `adce8fda2f465679ea6e8fe31124822a45a555b9dc154e12076ef5b6140699b0`.
- Verified sidecar SHA256 remains `a24da3473bf42a10fb9bde05e37495e5b69adffde9193dd4648daa9e0898996e`.
- `index.html` remains SHA256 `f538d30ea4ee70d4cccc325a80e7eb36a5e3734e88f223c9ea3fc659d9d121da`.
- Shared home assets remain unchanged: `assets/css/style.css` SHA256 `fc3dbbbc64beb45e8856909396270daf295b190781d28a4394ca3653210ed262`; `assets/js/app.js` SHA256 `d4b8719613da03e12ebde800ccd648e393463789fe781ab9606770352e041bc8`.
- The recovery shortcut does not synthesize model input. It calls the existing official-fixture daily path and existing synthetic monitoring/recovery namespace.
- The prototype still rejects an invented day 17. Supporting a real new date requires a separately specified and validated operational ingestion adapter, including schema, temporal continuity, missing-input policy, provenance, and acceptance evidence.

## Executed QA/QC

### Browser journey

Command:

```powershell
$env:RINTIK_API_URL='http://127.0.0.1:8140'
$env:RINTIK_FRONTEND_URL='http://127.0.0.1:4174'
$env:RINTIK_CDP_URL='http://127.0.0.1:9223'
node scripts/product_flow_browser_qa.js
```

Result: **PASS — 17 checks, 15 screenshots, no unexpected console errors**.

Evidence: `../qa/evidence/product-experience-overhaul/final-a11y/20261013135725/`

Important checks include real chronological recovery preparation, full 734-row completion, recovery reopening, reset after completion, replay after reset, responsive layouts, drawer keyboard/Escape behavior, Chromium accessibility-tree checks with no unnamed interactive controls, and fail-closed backend failure. Trace SHA256: `ae28cc98f5e457948dc5366eb80bfda67f92d16bc4451d019056bdd2c8ad9b4f`.

### Backend regression

```powershell
python -m unittest discover -s tests -v
```

Result: **PASS — 25/25 tests in 113.639 seconds**. This covers frozen inference, official numerical parity, chronological replay, restart/idempotency, monitoring/recovery, reset integrity, exports, and API failure contracts.

The independent M1, M2, and M3 verifier scripts also returned **PASS**. M1 reproduced 734/734 official outputs at four decimals with `max_abs_diff = 0.0`; M2 preserved no-lookahead, window parity, snapshot immutability, restart identity, and idempotency; M3 preserved 734 separate synthetic sensor rows, the three incidents, raw outage gaps, and 48 estimated recovery rows.

### Frontend contracts

The following are required to pass:

```powershell
npm run contract:test
npm run public-flow:test
npm run product-flow:test
npm run dashboard:test
```

The product-flow contract pins `index.html` and its two shared assets byte-for-byte.

### M5 rehearsal regression

```powershell
npm run rehearsal:test
```

Result: **PASS — 16 dates, 734 rows, 57.028 seconds**. Evidence: `../qa/evidence/product-experience-overhaul/m5-rehearsal/`.

This run also exposed and repaired a pre-existing reproducibility defect in the rehearsal harness: the per-day checksum referenced an undefined `fixture` variable. It now resolves each immutable official fixture through the day manifest before hashing it. The Dashboard steps were updated to use the new accessible drawer.

## Remaining limitation

This is a verified local prototype, not a production or live-IoT deployment. New operational dates beyond the official fixture are deliberately not accepted until an operational ingestion contract is designed and validated. The physical humidity series, incidents, thresholds, trust score, and recovery scenario remain explicitly simulated/illustrative and are not field validation evidence.
