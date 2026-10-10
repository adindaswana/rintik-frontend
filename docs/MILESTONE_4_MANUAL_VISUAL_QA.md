# Milestone 4 manual visual and keyboard QA

This runbook closes only the browser evidence gap left after automated M4 QA.
It uses the already populated, ignored QA database and does not retrain or
change the frozen model.

## 1. Start the verified local system

Open PowerShell window A:

```powershell
Set-Location 'C:\Kuliah\LOMBA\NSC UB DatSci 2026\FINAL\Prototipe\rintik-backend'
$env:RINTIK_DATABASE_PATH = "$PWD\runtime\m4-final-http-20261010.sqlite3"
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Wait for `Application startup complete`, then open
`http://127.0.0.1:8000/health`. Required values are `ready: true`,
`completed_days: 16`, `monitored_days: 16`, `source: real_original_pth`, and
`simulation: false`.

Open PowerShell window B:

```powershell
Set-Location 'C:\Kuliah\LOMBA\NSC UB DatSci 2026\FINAL\Prototipe\rintik-frontend'
python -m http.server 4173 --bind 127.0.0.1
```

Open Chrome or Edge at:

```text
http://127.0.0.1:4173/dashboard.html?api=http://127.0.0.1:8000
```

Use browser zoom 100%. Do not open `dashboard.html` as a `file://` URL.

## 2. Evidence location and capture rules

> Retest note (10 October): the first submitted 1918×826 screenshot exposed a
> hidden-panel chart sizing defect and predates its correction. Refresh the
> frontend with `Ctrl+F5` before capture. Do not reuse that image as after-fix
> evidence; capture every viewport below at the exact declared dimensions.

Save evidence under:

```text
C:\Kuliah\LOMBA\NSC UB DatSci 2026\FINAL\Prototipe\qa\evidence\m4-manual\
```

Use DevTools responsive mode (`Ctrl+Shift+M`) and its screenshot command so
the captured viewport is exact. Keep the browser URL and selected date visible
in either the screenshot or the accompanying manifest. Do not crop away error,
provenance, legend, or viewport context.

Required static evidence:

| File | Viewport | State and required visible evidence |
|---|---:|---|
| `01-overview-normal-1440x900.png` | 1440×900 | 3 September; service ready, date, 48/48, real P3, synthetic source, normal verdict |
| `02-overview-outage-1366x768.png` | 1366×768 | 6 September; suspected outage, dashed synthetic series/gap, estimated recovery and source labels |
| `03-overview-partial-1366x768.png` | 1366×768 | 29 August; 18/48 partial batch without fabricated points |
| `04-sensors-1440x900.png` | 1440×900 | Sensor Explorer; default selected sensors rendered in separate unit panels |
| `05-settings-1366x768.png` | 1366×768 | model/state hashes, pipeline/window, illustrative health, simulated audit labeling |
| `06-overview-tablet-768x1024.png` | 768×1024 | usable navigation/cards/chart with no clipped controls or body horizontal scroll |
| `07-overview-mobile-390x844.png` | 390×844 | readable primary hierarchy, date/export controls, provenance, no overlap |
| `08-sensors-mobile-390x844.png` | 390×844 | selector, disclosure, and chart panels usable without clipped labels |
| `09-backend-error-1366x768.png` | 1366×768 | URL ending `?api=http://127.0.0.1:8999`; explicit backend failure and no fake chart/result |
| `10-empty-state-1366x768.png` | 1366×768 | empty database state; upload guidance and no sample prediction |
| `11-restricted-gate-1366x768.png` | 1366×768 | failed simulated audit and Recovery gate `Restricted`; no automatic recovery claim |

For every responsive viewport, run this in DevTools Console and record `true`:

```javascript
document.documentElement.scrollWidth <= document.documentElement.clientWidth
```

### Empty-state server

For screenshot 10, stop window A with `Ctrl+C`, then run:

```powershell
$env:RINTIK_DATABASE_PATH = "$PWD\runtime\m4-visual-empty-20261010-a.sqlite3"
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Refresh the dashboard. Do not upload data. After capture, stop the server and
restart it with `m4-final-http-20261010.sqlite3`.

### Restricted-gate state

Use Settings / Technical Details, select `Fail simulasi`, and activate
`Terapkan status simulasi`. Return to 6 September Overview and capture the
restricted gate. This mutates only the ignored synthetic-demo QA database, not
the model or official data. Restore `Pass simulasi` after the capture.

## 3. Live keyboard recording

Record one continuous MP4 or WebM named `12-keyboard-flow` at 1366×768. Use no
mouse after focus enters the page. The recording must show:

1. `Tab` exposes a visible focus indicator on interactive controls.
2. On the dashboard tablist, `ArrowRight`, `ArrowLeft`, `Home`, and `End` move
   focus and activate the expected panel without trapping focus.
3. Date selector and previous/next-day buttons are reachable and operable.
4. On the RH chart, focus reaches the plot; `ArrowRight` and `ArrowLeft` change
   the tooltip timestamp/value.
5. `Enter` on `Tampilkan tabel` reveals the accessible data table; another
   activation hides it and updates the button label/state.
6. Sensor Explorer search accepts typed text; group disclosures operate with
   `Enter`; checkboxes toggle with `Space`; reset and clear are reachable.
7. Settings controls are reachable, and `Tab` can leave every component. There
   is no keyboard trap or unexpected focus loss.

Enable Windows `Show text cursor indicator` only if the normal focus ring is
difficult to see in the recording; do not add temporary application CSS.

## 4. Loading, motion, console, and accessibility checks

- In DevTools Network, select `Fast 3G`, reload, and record or capture the
  loading overlay followed by real content. It must not flash sample data.
- Emulate `prefers-reduced-motion: reduce`; buttons, tabs, loading, and toast
  must remain understandable without meaningful movement.
- Inspect the Console through normal, outage, Sensor Explorer, Settings, empty,
  and backend-error states. Record uncaught application errors. A browser-only
  favicon warning may be recorded separately but must not hide JS/API errors.
- Run Chrome/Edge Lighthouse Accessibility on the populated Overview at desktop
  width. Save the HTML report as `13-lighthouse-accessibility.html` and capture
  its score/failed audits as `13-lighthouse-accessibility.png`. The score alone
  is not sufficient; unresolved serious/critical findings fail acceptance.

## 5. Manual result manifest

Create `M4_MANUAL_QA_RESULTS.md` beside the evidence with this table filled in:

| Check | PASS/FAIL | Evidence file | Observation |
|---|---|---|---|
| 1440 desktop overview |  |  |  |
| 1366 projector/outage |  |  |  |
| 1366 partial day |  |  |  |
| Sensor Explorer/unit separation |  |  |  |
| Settings/technical separation |  |  |  |
| 768 tablet |  |  |  |
| 390 mobile overview |  |  |  |
| 390 mobile sensors |  |  |  |
| Backend error/no fallback |  |  |  |
| Empty/no sample output |  |  |  |
| Restricted recovery gate |  |  |  |
| Live keyboard flow |  |  |  |
| Loading and reduced motion |  |  |  |
| Console errors |  |  |  |
| Lighthouse accessibility |  |  |  |

For every failure, include viewport, selected date/view, exact action, expected
behavior, observed behavior, console message, and evidence filename. Do not
mark a row PASS merely because the page loaded.

## 6. Evidence handoff

Attach the screenshots, recording, Lighthouse report, and manifest to the next
review message, or provide their exact local paths under `qa/evidence/m4-manual`.
The evidence will be reviewed critically. M4 remains BLOCKED until required
evidence passes and any material findings are fixed and retested.
