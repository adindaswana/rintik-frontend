# Milestone 4 browser evidence review — 10 October 2026

## Decision

The submitted browser screenshot is valid **partial evidence**, but it does not
close M4 visual, responsive, or keyboard acceptance. The image proves that the
real first daily batch was rendered in a Windows browser and exposed one major
layout defect. It is not the required exact 1440×900 capture and contains no
tablet, mobile, failure-state, keyboard, console, or accessibility evidence.

Evidence inspected:

- `qa/evidence/m4-manual/dashboard-desktop-29-aug.png.png`
- SHA256: `3732143819df0548b60b36e321c65179b5ed7010b9969a8d7b8cb38c832ebb33`
- Bitmap: 1918×826, 32-bit ARGB, approximately 144 DPI
- Visible state: 29 August 2023, 18/48 rows, replay 1/16

## Runtime and data corroboration

The dashboard was not judged from pixels alone. The live backend used by the
operator was queried at `http://127.0.0.1:8000`.

| Check | Result | Evidence |
|---|---|---|
| Frozen runtime identity | PASS | `ready=true`, `source=real_original_pth`, `simulation=false`, exact model SHA256 `adce8fda...` |
| User replay state | PASS | one completed and monitored day, 18 archived rows, next expected date `2023-08-30` |
| Screenshot date/count | PASS | API listed only 29 August with 18 completed rows |
| Model value shown | PASS | screenshot mean RINTIK 76.7% agrees with the 18 API predictions |
| Synthetic sensor value shown | PASS | screenshot mean 76.2% agrees with monitoring data; provenance says synthetic and not ground truth |
| Incident/recovery state | PASS with presentation defect | no incident and no recovery rows; API gate reason was technical, while the UI misleadingly displayed `Restricted` |
| State isolation | PASS | the full 16-day regression used a separate ignored SQLite database; the operator's one-day state was not mutated |

## Findings and implemented corrections

| Before | After | Why |
|---|---|---|
| RH chart occupied only about 720 px inside a much wider card | The target panel is made visible before first render, and visible charts rerender on tab activation | The chart previously measured a hidden container (`clientWidth=0`) and used the 720 px fallback; this was a real layout bug, not screenshot scaling |
| A healthy day with no incident showed recovery gate `Restricted` | Recovery is `Tidak aktif` and the gate says `Tidak diperlukan` when no incident exists | Avoids presenting a technical gate prerequisite as an operator alarm |
| Recovery legend was always visible even when the API supplied no recovery values | Recovery legend is shown only for a non-empty estimated recovery series | Prevents implying that a nonexistent series is present |
| Monitoring verdict `Operasional normal` did not state the evidence was synthetic | Operator verdicts now append `· simulasi` | Keeps simulation provenance visible at the point of interpretation |
| Raw state/reason strings and run/window details appeared in the operator overview | Sensor, incident, audit, and gate states are localized; overview shows calendar context while deep lineage remains in Settings | Restores the blueprint's separation between operator information and technical detail |
| A processed file stayed selected and could appear runnable again | Successful completion clears the file input, disables the action, and identifies the next expected date | Reduces accidental replay and makes chronological operation explicit |
| Every tab activation replayed a panel entrance animation | Tab content switches immediately; reduced-motion handling remains | Repeated navigation should prioritize keyboard responsiveness over decorative motion |
| Several operational annotations were 10–11 px | Important support text was raised by 1 px | Improves projector readability without changing layout hierarchy materially |

No evidence indicated a frozen-model, numerical, persistence, or provenance
failure. No model artifact, sidecar, formula, or official source file changed.

## QA executed after the corrections

| Command/check | Result |
|---|---|
| `node --check assets/js/dashboard.js` | PASS |
| `node --check lib/dashboard-data.js` | PASS |
| `npm run dashboard:test` | PASS; recovery presentation, render order, static accessibility, provenance, gap and unit checks |
| `npm run contract:test` | PASS; 8 calls, fail closed, explicit demo namespace |
| `npm run stub:test` | PASS; explicit legacy demo path remains bounded |
| Backend `python -m unittest discover -s tests -v` | PASS; 21 tests in 219.002 s |
| Backend sidecar `--check` | PASS; SHA256 `a24da347...`, 36,245 bytes |
| Fresh real HTTP integration on port 8136 | PASS; 16 days, 734 rows, 23 features, fault/repaired states, 48 recovery and export rows |
| Browser inventory after fixes | BLOCKED; Computer Use still reported `apps=[]`, `browsers=[]` |

## Remaining browser acceptance

The submitted screenshot predates these fixes and therefore cannot be used as
after-fix visual proof. Refresh the static frontend with `Ctrl+F5` and execute
the exact matrix in `MILESTONE_4_MANUAL_VISUAL_QA.md`. In particular, M4 still
requires exact 1440/1366/tablet/mobile captures, overflow checks, a continuous
keyboard-only recording, error/empty/restricted states, console review, loading
and reduced-motion review, and Lighthouse accessibility artifacts.

M4 status after this review: **BLOCKED pending browser retest evidence**.
