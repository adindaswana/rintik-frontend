#!/usr/bin/env python3
"""Bangun aset statis halaman Pemeriksaan (periksa.html).

Keluaran (semua di assets/data/):
  - train_stats.json            statistik per kolom sensor dari train.csv
  - demo_sehat.csv              15 hari terakhir train (15 s.d. 29 Agu 2023 14:30), apa adanya
  - demo_rusak.csv              sama, tetapi air_humidity dirusak (lihat README.md)
  - mock_monitor_response.json  jawaban tiruan POST /monitor untuk demo_rusak (HANYA uji lokal)
  - README.md                   keterangan file

Pakai:
  python3 scripts/build_monitor_assets.py [path/ke/train.csv]

Definisi "kenaikan harian" untuk kolom kumulatif (gdd, water_volume_line1..3)
HARUS sama dengan assets/js/periksa.js:
  median harian (nilai valid saja) dikurangi median hari kalender sebelumnya;
  hari pertama, atau hari yang hari sebelumnya tidak ada, dilewati.
"""
import csv
import json
import math
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
OUT = os.path.join(REPO, 'assets', 'data')
DEFAULT_TRAIN = '/Users/fransiskaadinda/Downloads/LOMBA/enesce/laporan/dataset/train.csv'

EXCLUDE = ['datetime', 'env_id', 'env_battery', 'air_humidity']
CUMULATIVE = ['gdd', 'water_volume_line1', 'water_volume_line2', 'water_volume_line3']
PCTS = [1, 5, 50, 95, 99]

DEMO_DAYS = 15
BREAK_FROM_DAY = 8      # hari ke-8 (1-based) mulai dikurangi 20
BREAK_OFFSET = 20.0
FLAT_DAY = 12           # hari ke-12 dibuat datar


def r4(x):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else round(float(x), 4)


def describe(s):
    s = pd.to_numeric(s, errors='coerce')
    v = s.dropna().to_numpy(dtype=float)
    out = {
        'n': int(v.size),
        'mean': r4(v.mean()) if v.size else None,
        'sd': r4(v.std(ddof=1)) if v.size > 1 else None,
        'missing_rate': r4(float(s.isna().mean())),
    }
    for p in PCTS:
        out['p%d' % p] = r4(np.percentile(v, p)) if v.size else None
    return out


def daily_increment(df, col):
    d = df[['date', col]].copy()
    d[col] = pd.to_numeric(d[col], errors='coerce')
    med = d.dropna().groupby('date')[col].median().sort_index()
    inc = []
    prev_day, prev_val = None, None
    for day, val in med.items():
        if prev_day is not None and (day - prev_day).days == 1:
            inc.append(val - prev_val)
        prev_day, prev_val = day, val
    return pd.Series(inc, dtype=float)


def build_stats(df, sensor_cols):
    cols = {}
    for c in sensor_cols:
        st = describe(df[c])
        if c in CUMULATIVE:
            inc = daily_increment(df, c)
            st['daily_increment'] = describe(inc)
            st['daily_increment'].pop('missing_rate', None)
            st['cumulative'] = True
        cols[c] = st
    return {
        'source': 'train.csv',
        'generated_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'n_rows': int(len(df)),
        'date_min': str(df['datetime'].min()),
        'date_max': str(df['datetime'].max()),
        'sd_ddof': 1,
        'percentile_method': 'numpy linear',
        'excluded': ['env_id', 'env_battery'],
        'cumulative': CUMULATIVE,
        'increment_method': 'median harian dikurangi median hari kalender sebelumnya',
        'columns': cols,
    }


def read_raw(path):
    with open(path, newline='') as f:
        rd = csv.reader(f)
        header = next(rd)
        rows = [r for r in rd]
    return header, rows


def write_csv(path, header, rows):
    with open(path, 'w', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(header)
        w.writerows(rows)


def fmt2(x):
    return ('%.2f' % x)


def main():
    train_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TRAIN
    os.makedirs(OUT, exist_ok=True)

    df = pd.read_csv(train_path)
    df['datetime'] = pd.to_datetime(df['datetime'], format='%Y-%m-%d %H:%M:%S')
    df['date'] = df['datetime'].dt.date
    sensor_cols = [c for c in df.columns if c not in EXCLUDE + ['date']]

    stats = build_stats(df, sensor_cols)
    with open(os.path.join(OUT, 'train_stats.json'), 'w') as f:
        json.dump(stats, f, indent=1, ensure_ascii=False)

    # ---------- demo files (teks asli train.csv, tanpa reformat) ----------
    header, raw = read_raw(train_path)
    i_dt = header.index('datetime')
    i_h = header.index('air_humidity')
    days_all = sorted({r[i_dt][:10] for r in raw})
    demo_days = days_all[-DEMO_DAYS:]
    sehat = [r for r in raw if r[i_dt][:10] in demo_days]
    assert demo_days[-1] == '2023-08-29' and sehat[-1][i_dt] == '2023-08-29 14:30:00', 'demo harus berakhir 29 Agu 14:30'
    write_csv(os.path.join(OUT, 'demo_sehat.csv'), header, sehat)

    break_days = set(demo_days[BREAK_FROM_DAY - 1:])
    flat_day = demo_days[FLAT_DAY - 1]
    rusak = [list(r) for r in sehat]
    for r in rusak:
        if r[i_dt][:10] in break_days and r[i_h] != '':
            r[i_h] = fmt2(min(100.0, max(0.0, float(r[i_h]) - BREAK_OFFSET)))
    flat_vals = [float(r[i_h]) for r in rusak if r[i_dt][:10] == flat_day and r[i_h] != '']
    flat_const = round(sum(flat_vals) / len(flat_vals), 2)
    for r in rusak:
        if r[i_dt][:10] == flat_day:
            r[i_h] = fmt2(flat_const)
    write_csv(os.path.join(OUT, 'demo_rusak.csv'), header, rusak)

    # ---------- mock /monitor (untuk demo_rusak) ----------
    mock = build_mock(sehat, rusak, i_dt, i_h, demo_days)
    with open(os.path.join(OUT, 'mock_monitor_response.json'), 'w') as f:
        json.dump(mock, f, indent=1, ensure_ascii=False)

    with open(os.path.join(OUT, 'README.md'), 'w') as f:
        f.write(README.format(
            first=demo_days[0], last=demo_days[-1], n=len(sehat),
            brk=demo_days[BREAK_FROM_DAY - 1], flat=flat_day, const=fmt2(flat_const),
            nstats=len(sensor_cols)))

    print('train_stats.json  kolom=%d (kumulatif=%d)' % (len(sensor_cols), len(CUMULATIVE)))
    print('demo_sehat.csv    baris=%d  %s s.d. %s' % (len(sehat), sehat[0][i_dt], sehat[-1][i_dt]))
    print('demo_rusak.csv    -%g mulai %s, datar %s = %s' % (BREAK_OFFSET, demo_days[BREAK_FROM_DAY - 1], flat_day, fmt2(flat_const)))
    print('mock summary      %s' % mock['summary'])


def build_mock(sehat, rusak, i_dt, i_h, demo_days):
    """Tebakan tiruan: bacaan asli yang dihaluskan + riak kecil deterministik.
    Bukan keluaran model. Status mengikuti aturan sederhana yang meniru kontrak."""
    truth = np.array([float(r[i_h]) if r[i_h] != '' else np.nan for r in sehat])
    sm = pd.Series(truth).rolling(5, center=True, min_periods=1).mean().to_numpy()
    k = np.arange(len(sm))
    p3 = np.clip(sm + 1.4 * np.sin(k / 7.0) + 0.6, 0, 100)
    inti = np.clip(sm + 1.1 * np.sin(k / 9.0 + 1.0) - 0.4, 0, 100)
    preds, by_day = [], {}
    for j, r in enumerate(rusak):
        s = float(r[i_h]) if r[i_h] != '' else None
        preds.append({'datetime': r[i_dt], 'sensor': s, 'p3': round(float(p3[j]), 2), 'inti': round(float(inti[j]), 2)})
        by_day.setdefault(r[i_dt][:10], []).append(j)

    days, summary = [], {'sehat': 0, 'waspada': 0, 'dugaan_malfungsi': 0, 'data_kurang': 0}
    for d in demo_days:
        idx = by_day[d]
        s = np.array([preds[j]['sensor'] for j in idx], dtype=float)
        m = p3[idx]
        ok = ~np.isnan(s)
        n = int(ok.sum())
        diff = s[ok] - m[ok]
        mean_diff = float(diff.mean())
        s_rng = float(np.ptp(s[ok]))
        m_rng = float(np.ptp(m[ok]))
        corr = float(np.corrcoef(s[ok], m[ok])[0, 1]) if s_rng > 1e-9 else None
        diff3 = float(np.abs(diff[-6:]).mean())
        reasons = []
        if n < 24:
            status = 'data_kurang'
            reasons.append('Bacaan sensor hari ini terlalu sedikit (%d dari 48).' % n)
        elif s_rng < 0.25 * m_rng:
            status = 'dugaan_malfungsi'
            reasons.append('Bacaan sensor nyaris datar sepanjang hari (rentang %.1f poin), padahal tebakan RINTIK bergerak %.1f poin.' % (s_rng, m_rng))
        elif abs(mean_diff) >= 10:
            status = 'dugaan_malfungsi'
            reasons.append('Selisih rata-rata %+.1f poin, melewati batas 10 poin.' % mean_diff)
            if diff3 >= 10:
                reasons.append('Selisih 3 jam terakhir tetap besar (%.1f poin).' % diff3)
        elif abs(mean_diff) >= 5 or (corr is not None and corr < 0.6):
            status = 'waspada'
            if abs(mean_diff) >= 5:
                reasons.append('Selisih rata-rata %+.1f poin, di atas batas waspada 5 poin.' % mean_diff)
            if corr is not None and corr < 0.6:
                reasons.append('Pola naik-turun sensor kurang searah dengan tebakan RINTIK.')
        else:
            status = 'sehat'
        summary[status] += 1
        days.append({
            'date': d, 'n': n, 'mean_diff': round(mean_diff, 2),
            'corr': None if corr is None else round(corr, 3),
            'sensor_range': round(s_rng, 2), 'model_range': round(m_rng, 2),
            'diff3': round(diff3, 2), 'status': status, 'reasons': reasons,
        })
    return {
        '_mock': True,
        '_note': 'MOCK untuk uji lokal (?mock=1). Tebakan p3/inti BUKAN keluaran model.',
        'count': len(preds), 'comparator': 'p3', 'rule_version': 'demo-v1', 'center': 0.0,
        'predictions': preds, 'days': days, 'summary': summary,
    }


README = """# assets/data

Dibangun ulang oleh `scripts/build_monitor_assets.py`. Jangan disunting manual.

| File | Isi |
|---|---|
| `train_stats.json` | Statistik {nstats} kolom sensor dari `train.csv` (mean, sd, p1, p5, p50, p95, p99, missing_rate). Kolom kumulatif (`gdd`, `water_volume_line1..3`) punya `daily_increment`: median harian dikurangi median hari sebelumnya. `env_id` dan `env_battery` dikecualikan. |
| `demo_sehat.csv` | {n} baris, {first} 00:00 s.d. {last} 14:30, semua kolom train termasuk `air_humidity`, teks apa adanya (sel kosong tetap kosong). Data latih, jadi in-sample. |
| `demo_rusak.csv` | Sama dengan `demo_sehat.csv`, hanya `air_humidity` yang diubah (lihat di bawah). |
| `mock_monitor_response.json` | Jawaban tiruan `POST /monitor` untuk `demo_rusak.csv`. Hanya untuk uji lokal lewat `periksa.html?mock=1`. Tebakan `p3`/`inti` di sini adalah bacaan asli yang dihaluskan, BUKAN keluaran model. |

## Kerusakan pada `demo_rusak.csv`

1. Mulai hari ke-8 ({brk}) sampai akhir: `air_humidity` dikurangi 20 poin, lalu dibatasi ke 0 sampai 100. Meniru sensor yang bergeser (drift/offset).
2. Hari ke-12 ({flat}): seluruh `air_humidity` hari itu diganti satu nilai konstan {const}, yaitu rata-rata hari itu setelah dikurangi 20. Meniru sensor macet (flatline).

Hari ke-1 sampai ke-7 identik dengan `demo_sehat.csv`.
"""

if __name__ == '__main__':
    main()
