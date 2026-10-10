# Milestone 4 autonomous browser QA closure — 10 October 2026

## Decision

Milestone 4 browser acceptance is **PASS**. A real Chrome process on the
Windows host was controlled through its localhost CDP endpoint; the test did
not infer visual behavior from DOM or API checks alone. The final run completed
15/15 browser checks and produced exact-viewport screenshots, a Playwright
trace, responsive geometry, keyboard traversal, console events, reduced-motion
values, Chromium accessibility-tree results, and axe-core results.

This decision closes the M4 visual, responsive, keyboard, failure-state, and
accessibility evidence gaps. It does not claim clean-machine/offline demo
readiness, field validation, real-device touch testing, or completion of M5.

## Runtime and protected inputs

- Browser: Chrome `154.0.8037.98`, headless-new, sandbox retained.
- Browser endpoint: `http://127.0.0.1:9223`, bound to localhost only.
- Frontend: `http://127.0.0.1:4173`.
- Populated backend: `http://127.0.0.1:8140`.
- Independent empty-state backend: `http://127.0.0.1:8142`.
- Model source: `real_original_pth`, never a stub.
- Model SHA256:
  `adce8fda2f465679ea6e8fe31124822a45a555b9dc154e12076ef5b6140699b0`.
- State SHA256:
  `a24da3473bf42a10fb9bde05e37495e5b69adffde9193dd4648daa9e0898996e`.

The browser launcher uses a unique QA profile, quotes Windows arguments that
contain spaces, detects port conflicts without killing unrelated processes,
falls back from Chrome to Edge, and records launch diagnostics. It does not use
`--no-sandbox`, alter firewall/security settings, or reuse the personal browser
profile.

## Final evidence

Evidence directory:
`Prototipe/qa/evidence/m4-browser-automated/`

| Check | Result | Evidence |
|---|---|---|
| Normal Overview | PASS | `01-overview-normal-1440x900.png`, exact 1440×900 |
| Outage/recovery | PASS | `02-overview-outage-1366x768.png`, exact 1366×768 |
| Partial first day | PASS | `03-overview-partial-1366x768.png`, 18/48 without fabricated rows |
| Sensor Explorer | PASS | `04-sensors-1440x900.png`, unit-separated panels and null gaps |
| Technical separation | PASS | `05-settings-1366x768.png`, lineage/hashes/illustrative health outside Overview |
| Tablet | PASS | `06-overview-tablet-768x1024.png`, no body overflow or overlapping controls |
| Mobile Overview | PASS | `07-overview-mobile-390x844.png`, all navigation tabs visible after correction |
| Mobile Sensor Explorer | PASS | `08-sensors-mobile-390x844.png`, search and selector readable |
| Backend failure | PASS | `09-backend-error-1366x768.png`, explicit failure and no result/fake chart |
| Empty state | PASS | `10-empty-state-1366x768.png`, no sample prediction |
| Restricted recovery | PASS | `11-restricted-gate-1366x768.png`, failed simulated audit blocks recovery claim |
| Keyboard-only workflow | PASS | `12-keyboard-trace.zip`, `12a`–`12c` screenshots, `keyboard-results.json` |
| Runtime accessibility | PASS | `accessibility-runtime.json`, `accessibility-axe.json`, `13-accessibility-overview-1440x900.png` |
| Throttled loading | PASS | `14-loading-fast-3g-1366x768.png`, no stale/sample result substituted |
| Reduced motion | PASS | `15-reduced-motion-1366x768.png`, `reduced-motion.json` |
| Console/network review | PASS | `browser-console.json`; only the deliberately unreachable port 8999 failed |

The trace archive contains `trace.trace`, `trace.network`, and captured page
resources. Its SHA256 is
`6240710efd3f02f025d65c006ba387d216cdfad735323af236dd6137f5f254c5`.
The final result manifest SHA256 is
`cb32b2688e0f29f34e4bb1e70fb211910a55b58074009cc4cfe9c8aa73542186`.

## Findings and corrections

The final visual review found no critical content, provenance, graph, overlap,
or hierarchy defect. Earlier automated passes exposed the following real
issues, all corrected and retested:

1. The hidden file input had no accessible name. It now has an associated
   label and is removed from sequential keyboard navigation; the visible
   button remains the supported chooser control.
2. The keyboard-interactive RH plot was nested in an `aria-hidden` SVG. The
   plot is now exposed as a named slider with value metadata updated during
   arrow-key traversal.
3. Metric notes, diagnostic fine print, Sensor Explorer annotations, and chart
   axis labels had insufficient small-text contrast. Their final foreground
   colors meet the 4.5:1 small-text threshold on the rendered backgrounds.
4. Three generic containers used `aria-label` without a permitted role. They
   now use explicit grouping semantics.
5. The 390 px navigation used a large native horizontal scrollbar and clipped
   the Settings label. It now uses a two-row responsive grid with all three
   navigation targets visible.
6. The launcher initially truncated an unquoted `--user-data-dir` path at the
   first space. Quoted arguments, per-run profiles, port ownership checks, and
   structured diagnostics resolve the root cause.

The final axe-core `4.10.3` run covered Overview, Sensor Explorer, and Settings:
zero violations in every view. The remaining `incomplete` contrast entries are
manual-review cases for decorative glyphs, SVG text whose background axe cannot
infer, and a gradient badge. Decorative glyphs are hidden from assistive
technology, chart text uses `#60716a` on white (calculated ratio 5.16:1), and
the rendered badge/text were inspected in the final screenshots.

Chrome Lighthouse itself was not executed because the package was absent and
the Codex npm network path was unavailable. This is recorded as a tooling
substitution, not represented as a Lighthouse result. Accessibility acceptance
uses the live Chromium AX tree plus axe-core across all product tabs, keyboard
trace, focus screenshots, semantic DOM checks, and manual visual review. This
is broader than the earlier single-page Lighthouse requirement and found
defects that the static checks had missed.

## Regression evidence after fixes

| Command | Result |
|---|---|
| `npm run browser:test` | PASS, 15 checks |
| `npm run stub:test` | PASS, explicit legacy demo only |
| `npm run contract:test` | PASS, 8 calls, fail closed |
| `npm run dashboard:test` | PASS, provenance/gaps/units/accessibility references |
| `npm run integration:test` on isolated port 8141 before final empty-state rerun | PASS, 16 days, 734 rows, 23 features, 48 recovery/export rows |
| Backend `python -m unittest discover -s tests -v` | PASS, 21 tests in 138.781 s |
| Sidecar `--check` | PASS, 36,245 bytes, exact state SHA256 |
| M1 verifier | PASS, 734/734 parity, max/mean absolute difference 0 |
| M2 verifier | PASS, prefix/Post 1–3 differences 0; restart/snapshot/idempotency true |
| M3 verifier | PASS, 734 synthetic rows separate; recovery/gates/provenance intact |

No checkpoint, sidecar, official fixture, inference formula, database schema,
or backend source file changed during this closure. The backend repository
remains clean at `cc64100`.

## Remaining limits

- Real iOS/Android hardware and software-keyboard behavior were not tested;
  Chrome viewport emulation proves responsive layout, not native-device feel.
- Lighthouse-format HTML was not generated; the exact substitute and reason
  are documented above.
- The QA harness downloads pinned axe-core `4.10.3` at test time. This is a QA
  dependency only; the RINTIK application remains dependency-free and works
  without that network request.
- Clean-machine start/stop, offline rehearsal, video packaging, and operator
  timing remain M5 scope. M5 was not started.
