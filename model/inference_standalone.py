"""Inference mandiri end-to-end dari HBD_AirHumidity_Final_Model_standalone.pth.

Alur persis notebook FINALIZATION_IPYNB_HBD.ipynb (tanpa retraining, tanpa ubahan recipe):
  input test.csv (+ opsional train.csv untuk mode exact)
  -> feature engineering (cell 64) -> stage1 daily level + carry (cell 67)
  -> stage2 deviasi A/B (cell 73) -> rekonstruksi EWM 0.72 (cell 82)
  -> post-1 tail compression (cell 85) -> post-2 multilayer (cell 88)
  -> post-3 beam (cell 91) -> CSV datetime,air_humidity (cell 106)

Pakai:
  python inference_standalone.py --test test.csv --out submission.csv
  python inference_standalone.py --test test.csv --train train.csv --out submission.csv  # mode exact

Dependensi: numpy, pandas, xgboost, lightgbm, torch (hanya torch.load).
"""
import argparse
import os

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

import numpy as np
import pandas as pd
import torch
import xgboost as xgb
import lightgbm as lgb
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_PTH = HERE / "HBD_AirHumidity_Final_Model_standalone.pth"


def load_artifact(path):
    try:
        return torch.load(str(path), map_location="cpu", weights_only=False)
    except TypeError:
        return torch.load(str(path), map_location="cpu")


def esf(x):
    x = np.asarray(x, float)
    return 0.6108 * np.exp(17.27 * x / (x + 237.3))


def causal_ewm(x, a):
    x = np.asarray(x, float)
    if a < 1:
        return pd.Series(x).ewm(alpha=a).mean().to_numpy()
    return x


def clip100(v):
    return np.clip(np.asarray(v, dtype=float), 0.0, 100.0)


def tail_compression(v, quantile, strength):
    v = np.asarray(v, dtype=float)
    center = float(np.median(v))
    distance = np.abs(v - center)
    threshold = float(np.quantile(distance, quantile))
    return v - strength * np.sign(v - center) * np.maximum(distance - threshold, 0.0)


def lead_lag_center(v, weight):
    v = np.asarray(v, dtype=float)
    prev = np.roll(v, 1)
    prev[0] = v[0]
    nxt = np.roll(v, -1)
    nxt[-1] = v[-1]
    return (1 - weight) * v + weight * (0.5 * prev + 0.5 * nxt)


def rolling_median_blend(v, window, weight):
    v = np.asarray(v, dtype=float)
    med = pd.Series(v).rolling(window, center=True, min_periods=1).median().to_numpy()
    return (1 - weight) * v + weight * med


def curvature(v, strength):
    v = np.asarray(v, dtype=float)
    d1 = np.diff(v, prepend=v[0])
    d2 = np.diff(d1, prepend=d1[0])
    return v + strength * d2


def slot_blend(v, timestamps, weight):
    v = np.asarray(v, dtype=float)
    t = pd.Series(pd.to_datetime(timestamps)).reset_index(drop=True)
    slot = t.dt.hour.to_numpy() * 2 + t.dt.minute.to_numpy() // 30
    slot_mean = pd.DataFrame({"slot": slot, "value": v}).groupby("slot")["value"].transform("mean").to_numpy()
    return (1 - weight) * v + weight * slot_mean


def build_features(frame, DRIV, DAG, HARM):
    full = frame.copy()
    full["es"] = esf(full["air_temperature"])
    full["day"] = full["datetime"].dt.floor("D")
    full["slot"] = (full["datetime"].dt.hour * 2 + full["datetime"].dt.minute // 30).astype(int)
    for c in DRIV:
        g = full.groupby("day")[c]
        full[c + "_dm"] = g.transform("mean")
        full[c + "_dsd"] = g.transform("std")
        full[c + "_dmin"] = g.transform("min")
        full[c + "_dmax"] = g.transform("max")
        full[c + "_dev"] = full[c] - full[c + "_dm"]
    full["phys_ratio"] = esf(full["air_temperature_dm"]) / full["es"]
    for k in range(1, 11):
        full[f"sh{k}"] = np.sin(2 * np.pi * k * full["slot"] / 48)
        full[f"ch{k}"] = np.cos(2 * np.pi * k * full["slot"] / 48)
    full["dT"] = full["air_temperature_dev"]
    full["des"] = full["es_dev"]
    full["dT2"] = full["dT"] ** 2
    full["dTdes"] = full["dT"] * full["des"]
    for f in ["dT", "des", "soil_humidity_line2_dev", "co2_dev"]:
        for L in [1, 2, 3, 6, 12]:
            full[f"{f}_l{L}"] = full.groupby("day")[f].shift(L)
    return full


def predict(test_path, out_path, pth_path=DEFAULT_PTH, train_path=None):
    art = load_artifact(pth_path)
    TARGET = art["target"]
    FE = art["feature_engineering"]
    DRIV, DAG = FE["DRIV"], FE["DAG"]
    S2, S2B = art["stage2"]["A"]["features"], art["stage2"]["B"]["features"]

    test = pd.read_csv(test_path, parse_dates=["datetime"]).sort_values("datetime").reset_index(drop=True)
    assert TARGET not in test.columns, "test.csv tidak boleh memuat kolom target"
    if train_path:
        train = pd.read_csv(train_path, parse_dates=["datetime"]).sort_values("datetime").reset_index(drop=True)
        frame = pd.concat([train, test], ignore_index=True).sort_values("datetime").reset_index(drop=True)
        n_train = len(train)
    else:
        # Konteks hari pertama yang dibekukan: 30 baris train 2023-08-29 00:00-14:30,
        # kontigu tepat sebelum baris test pertama (15:00). Membuat agregat harian
        # dan lag dalam-hari identik dengan notebook tanpa meminta train.csv.
        ctx_rows = art.get("inference_state", {}).get("day_context", {}).get("rows", [])
        if ctx_rows:
            ctx = pd.DataFrame(ctx_rows)
            ctx["datetime"] = pd.to_datetime(ctx["datetime"])
            have = set(test["datetime"].astype(str))
            ctx = ctx[~ctx["datetime"].astype(str).isin(have)]
            frame = pd.concat([ctx, test], ignore_index=True).sort_values("datetime").reset_index(drop=True)
            n_train = len(ctx)
        else:
            frame = test.copy()
            n_train = 0

    full = build_features(frame, DRIV, DAG, FE["HARM"])
    DFEAT = list(dict.fromkeys(DAG + [c + s for c in DRIV for s in ["_dm", "_dsd", "_dmin", "_dmax"]]))
    dtf = full.groupby("day").agg(**{f: (f, "first") for f in DFEAT})
    dtf["doy"] = dtf.index.dayofyear

    st = art["inference_state"]
    FEATS = st["daily_median_features"]
    med = pd.Series(st["daily_median"], index=FEATS)
    Xa = dtf.reindex(columns=FEATS).fillna(med)

    s1 = art["stage1"]["ridge"]
    p_ridge = ((Xa.values - s1["scaler_mean"]) / s1["scaler_scale"]) @ s1["coef"] + s1["intercept"]
    gb1 = lgb.Booster(model_str=art["stage1"]["lgbm"]["model_string"])
    xb1 = xgb.Booster()
    xb1.load_model(bytearray(art["stage1"]["xgb"]["raw_model"]))
    p = (art["stage1"]["blend"]["ridge"] * p_ridge
         + art["stage1"]["blend"]["lgbm"] * gb1.predict(Xa.values)
         + art["stage1"]["blend"]["xgb"] * xb1.predict(xgb.DMatrix(Xa.values, feature_names=FEATS)))
    base = pd.Series(0.85 * p + 0.15 * st["last10_mean"], index=dtf.index)

    test_days = list(pd.Index(test["datetime"].dt.floor("D").unique()))
    carry = art["stage1"]["carry"]
    lvl_series = base.copy()
    for k, dd in enumerate(test_days):
        if dd in lvl_series.index:
            lvl_series[dd] = base[dd] + carry["weight"] * st["carry_r0"] * (carry["rho"] ** k)
    full["lvl"] = full["day"].map(lvl_series)

    tei = list(range(n_train, n_train + len(test)))
    fx = full.copy()
    fx["phys_dev"] = full["lvl"] * full["phys_ratio"] - full["lvl"]
    for L in [1, 2, 3, 6, 12]:
        fx[f"phys_dev_l{L}"] = fx.groupby("day")["phys_dev"].shift(L)

    def ensemble(feat, models_xgb, models_lgb):
        Xe = fx[feat].fillna(0.0).values[tei]
        px = np.mean([m.predict(xgb.DMatrix(Xe, feature_names=feat)) for m in models_xgb], axis=0)
        pl = np.mean([m.predict(Xe) for m in models_lgb], axis=0)
        w = art["stage2"]["A"]["tree_blend_weight_xgb"]
        return w * px + (1 - w) * pl

    Ax = []
    for m in art["stage2"]["A"]["xgb"]:
        b = xgb.Booster()
        b.load_model(bytearray(m["raw_model"]))
        Ax.append(b)
    Al = [lgb.Booster(model_str=m["model_string"]) for m in art["stage2"]["A"]["lgbm"]]
    Bx = []
    for m in art["stage2"]["B"]["xgb"]:
        b = xgb.Booster()
        b.load_model(bytearray(m["raw_model"]))
        Bx.append(b)
    Bl = [lgb.Booster(model_str=m["model_string"]) for m in art["stage2"]["B"]["lgbm"]]
    dev_te = art["stage2"]["amplitude"] * (art["stage2"]["A_B_blend_weight_A"] * ensemble(S2, Ax, Al)
                                           + (1 - art["stage2"]["A_B_blend_weight_A"]) * ensemble(S2B, Bx, Bl))

    lvl_te = full["lvl"].to_numpy()[tei]
    rec = art["reconstruction"]
    pred_internal = np.clip(causal_ewm(lvl_te + dev_te, rec["smoothing_alpha"]), *rec["physical_clip"])

    pm = art["post_modelling"]
    post_1 = clip100(tail_compression(pred_internal, pm["tail_quantile"], pm["tail_strength"]))
    ml3 = clip100(rolling_median_blend(
        clip100(lead_lag_center(clip100(post_1 + pm["affine_shift"]), pm["lead_lag_weight"])),
        pm["rolling_window"], pm["rolling_weight_stage2"]))
    post_2 = clip100(0.20 * ml3 + 0.80 * clip100(tail_compression(ml3, pm["tail_quantile"], pm["tail_strength"])))
    beam4 = clip100(slot_blend(
        clip100(rolling_median_blend(
            clip100(curvature(clip100(np.median(post_2) + pm["beam_amplitude"] * (post_2 - np.median(post_2))),
                              pm["curvature_strength"])),
            pm["rolling_window"], pm["rolling_weight_beam"])),
        test["datetime"], pm["slot_blend_weight"]))
    final_prediction = clip100(0.97 * beam4 + 0.03 * causal_ewm(beam4, pm["beam_ewm_alpha"]))

    sub = pd.DataFrame({"datetime": test["datetime"].dt.strftime("%Y-%m-%d %H:%M:%S"),
                        TARGET: np.round(final_prediction, 4)})
    sub.to_csv(out_path, index=False)
    return sub


def main():
    ap = argparse.ArgumentParser(description="Inference mandiri HBD Air Humidity (stub-free, dari .pth standalone).")
    ap.add_argument("--test", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--train", default=None, help="opsional, mode exact untuk agregat hari pertama")
    ap.add_argument("--pth", default=str(DEFAULT_PTH))
    a = ap.parse_args()
    sub = predict(a.test, a.out, a.pth, a.train)
    print("wrote", a.out, sub.shape, "mean %.4f" % sub["air_humidity"].mean())


if __name__ == "__main__":
    main()
