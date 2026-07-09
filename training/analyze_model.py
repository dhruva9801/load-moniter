"""
analyze_model.py — model diagnostics for CLM.

Data geometry: ~7 session CSVs, ONE NASA-TLX label per session stamped onto
every 5-second window. Consequences that shape this script:

  * Evaluation must be leave-one-session-out (LOSO). Any split that mixes
    windows from one session across train/test lets the model fingerprint
    the session and retrieve its constant label — that's leakage, not skill.
  * Per-fold R² is degenerate: a held-out session has constant y_true
    (zero variance), so R² is undefined within a fold. We therefore pool
    out-of-fold predictions across all folds and compute ONE global R²/MAE.
  * Effective sample size is the number of sessions (~7), not the row count.

Run from the repo root:
    python training/analyze_model.py
"""

import glob

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import LeaveOneGroupOut, cross_val_predict
from sklearn.preprocessing import StandardScaler

# ---------------------------------------------------------------------------
# Config — column names must match the session CSVs in training/data/.
# ---------------------------------------------------------------------------
DATA_GLOB = "training/data/*.csv"
FEATURE_COLS = [
    "meanHold",
    "stdHold",
    "meanFlight",
    "stdFlight",
    "typingSpeed",
    "backspaceRate",
]
LABEL_COL = "label"
GROUP_COL = "sessionId"  # not present in the CSVs -> each file becomes one session
SEED = 42


def load_data() -> pd.DataFrame:
    files = sorted(glob.glob(DATA_GLOB))
    if not files:
        raise SystemExit(f"No CSVs found at {DATA_GLOB} — run from the repo root.")
    frames = []
    for f in files:
        df = pd.read_csv(f)
        if GROUP_COL not in df.columns:
            df[GROUP_COL] = f  # one file == one task session
        frames.append(df)
    data = pd.concat(frames, ignore_index=True)
    missing = [c for c in FEATURE_COLS + [LABEL_COL] if c not in data.columns]
    if missing:
        raise SystemExit(f"Missing expected columns: {missing}")
    return data


def main() -> None:
    data = load_data()
    X = data[FEATURE_COLS].to_numpy(dtype=float)
    y = data[LABEL_COL].to_numpy(dtype=float)
    groups = data[GROUP_COL].to_numpy()

    session_labels = data.groupby(GROUP_COL)[LABEL_COL].first()
    n_sessions = len(session_labels)
    print(f"rows={len(data)}  sessions={n_sessions}  features={len(FEATURE_COLS)}")
    print(f"distinct session labels: {sorted(session_labels.unique().round(3))}")
    if n_sessions < 3:
        raise SystemExit("Fewer than 3 sessions — LOSO evaluation is meaningless.")
    if session_labels.nunique() < 2:
        raise SystemExit(
            "All sessions share one label — nothing can be evaluated. "
            "Check LABEL_COL and the CSVs."
        )

    # RF doesn't need scaling; we scale so LR and RF see identical inputs.
    X_scaled = StandardScaler().fit_transform(X)

    logo = LeaveOneGroupOut()
    models = {
        "LinearRegression": LinearRegression(),
        "RandomForest": RandomForestRegressor(n_estimators=100, random_state=SEED),
    }

    print(f"\n=== Leave-one-session-out CV ({n_sessions} folds, pooled metrics) ===")
    rf_preds = None
    for name, model in models.items():
        preds = cross_val_predict(model, X_scaled, y, cv=logo, groups=groups)
        print(f"{name:>18}:  pooled R2 = {r2_score(y, preds):.2f}   "
              f"pooled MAE = {mean_absolute_error(y, preds):.2f}")
        if name == "RandomForest":
            rf_preds = preds

    # Naive baseline: always predict the mean of the training sessions' labels.
    # Any model that can't beat this has learned nothing about load.
    naive = np.empty_like(y)
    for train_idx, test_idx in logo.split(X_scaled, y, groups):
        naive[test_idx] = y[train_idx].mean()
    print(f"{'PredictTrainMean':>18}:  pooled R2 = {r2_score(y, naive):.2f}   "
          f"pooled MAE = {mean_absolute_error(y, naive):.2f}")

    # --- Feature importances (fit on all data; ranking only, not evaluation)
    rf = RandomForestRegressor(n_estimators=100, random_state=SEED).fit(X_scaled, y)
    print("\n=== Feature importances (RF, full fit) ===")
    for name, imp in sorted(
        zip(FEATURE_COLS, rf.feature_importances_), key=lambda t: -t[1]
    ):
        print(f"{name:>14}: {imp:.2f}")

    # --- Per-session view: how far off is the model on each held-out task?
    print("\n=== Per-session out-of-fold results (RF) ===")
    report = pd.DataFrame({"session": groups, "actual": y, "pred": rf_preds})
    print(
        report.groupby("session")
        .agg(n=("actual", "size"),
             label=("actual", "first"),
             mean_pred=("pred", "mean"),
             mae=("pred", lambda p: np.mean(np.abs(p - report.loc[p.index, "actual"]))))
        .round(3)
        .to_string()
    )
    print("\nReading guide: mean_pred pulled toward the middle on the highest- and "
          "lowest-label sessions is the regression-to-the-mean effect. If RF's "
          "pooled R2 is at or below PredictTrainMean's, the model has not learned "
          "a generalizable load signal from 7 labeled tasks — report that honestly.")


if __name__ == "__main__":
    main()