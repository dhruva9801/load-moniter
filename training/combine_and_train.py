"""
combine_and_train.py

Combines CSV files from all collaborators, trains a Random Forest regressor
to predict cognitive load (0-1) from keystroke features, and exports the
trained model as an ONNX file ready to be dropped into the Angular app.

Usage:
    python combine_and_train.py

Output:
    models/keystroke_model.onnx   — the trained model
    models/scaler_params.json     — StandardScaler mean/std needed for inference in the browser

Drop CSVs exported from the CLM app into the data/ folder before running.
"""

import json
import glob
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import GroupShuffleSplit, train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType


# ── Constants ────────────────────────────────────────────────────────────────

DATA_DIR        = 'data/*.csv'
MODEL_OUT       = 'models/keystroke_model.onnx'
SCALER_OUT      = 'models/scaler_params.json'

# These must match the columns logged by DataLoggerService exactly.
# Do NOT include deviation columns — the model learns those relationships itself.
FEATURE_COLS = [
    'meanHold',
    'stdHold',
    'meanFlight',
    'stdFlight',
    'typingSpeed',
    'backspaceRate',
]

LABEL_COL = 'label'
USER_COL  = 'userId'

# Minimum labeled rows required before training is even attempted.
# Below this number your model will overfit badly and be worthless.
MIN_ROWS = 200


# ── Load data ────────────────────────────────────────────────────────────────

def load_data() -> pd.DataFrame:
    files = glob.glob(DATA_DIR)

    if not files:
        raise FileNotFoundError(
            'No CSV files found in data/. Export sessions from the CLM app and drop them here.'
        )

    print(f'Found {len(files)} CSV file(s): {[f.split("/")[-1] for f in files]}')

    df = pd.concat([pd.read_csv(f) for f in files], ignore_index=True)

    # Drop unlabeled rows — these have no ground truth to train on
    before = len(df)
    df = df.dropna(subset=[LABEL_COL])
    dropped = before - len(df)
    if dropped > 0:
        print(f'Dropped {dropped} unlabeled rows.')

    return df


# ── Validate ─────────────────────────────────────────────────────────────────

def validate(df: pd.DataFrame) -> None:
    missing_cols = [c for c in FEATURE_COLS + [LABEL_COL, USER_COL] if c not in df.columns]
    if missing_cols:
        raise ValueError(f'Missing columns in CSV data: {missing_cols}')

    if len(df) < MIN_ROWS:
        raise ValueError(
            f'Only {len(df)} labeled rows found. Need at least {MIN_ROWS}. '
            f'Collect more sessions before training.'
        )

    # Warn if label distribution is badly skewed — model will be biased
    low    = (df[LABEL_COL] < 0.33).sum()
    medium = ((df[LABEL_COL] >= 0.33) & (df[LABEL_COL] < 0.66)).sum()
    high   = (df[LABEL_COL] >= 0.66).sum()
    total  = len(df)

    print(f'\nLabel distribution:')
    print(f'  Low   (<0.33): {low}  ({100*low/total:.1f}%)')
    print(f'  Med  (0.33-0.66): {medium}  ({100*medium/total:.1f}%)')
    print(f'  High  (>0.66): {high}  ({100*high/total:.1f}%)')

    # If any class is under 15% of the data, the model will underperform on that range
    if min(low, medium, high) / total < 0.15:
        print(
            '\nWARNING: Label distribution is skewed. '
            'Collect more sessions covering the underrepresented load range before trusting this model.'
        )

    print(f'\nUsers in dataset: {df[USER_COL].unique().tolist()}')
    print(f'Rows per user:\n{df.groupby(USER_COL)[LABEL_COL].count().to_string()}')

    if df[USER_COL].nunique() == 1:
        print(
            '\nNote: single-user dataset. This model will be personalized to this '
            'user only and will not generalize to other people. That is fine for '
            'validating the pipeline — retrain with more users before relying on '
            'it for anyone else.'
        )


# ── Train ────────────────────────────────────────────────────────────────────

def train(df: pd.DataFrame):
    X = df[FEATURE_COLS].values.astype(np.float32)
    y = df[LABEL_COL].values.astype(np.float32)
    groups = df[USER_COL].values

    n_users = len(np.unique(groups))

    if n_users > 1:
        # Multiple users — split by group so no user appears in both train and test.
        # This is the only honest way to evaluate generalization across people.
        splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
        train_idx, test_idx = next(splitter.split(X, y, groups))
        print(f'\nMultiple users detected ({n_users}) — splitting by user group.')
    else:
        # Single user — there's no group to split on, so fall back to a normal
        # random split. This model will only be personalized to this one user
        # and will NOT generalize to anyone else. That's expected at this stage.
        print(f'\nOnly 1 user detected — training a personal model (will not generalize to others).')
        idx = np.arange(len(X))
        train_idx, test_idx = train_test_split(idx, test_size=0.2, random_state=42)

    X_train, X_test = X[train_idx], X[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]

    print(f'\nTrain: {len(X_train)} rows | Test: {len(X_test)} rows')
    print(f'Test users: {np.unique(groups[test_idx]).tolist()}')

    # Scale features — Random Forest doesn't strictly require this but it makes
    # the scaler_params.json output directly usable for inference in the browser
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled  = scaler.transform(X_test)

    model = RandomForestRegressor(
        n_estimators=100,
        max_depth=8,         # cap depth to reduce overfitting on small datasets
        min_samples_leaf=5,  # each leaf needs at least 5 samples — prevents memorization
        random_state=42,
        n_jobs=-1
    )

    model.fit(X_train_scaled, y_train)

    # Evaluate
    y_pred = model.predict(X_test_scaled)
    mae    = mean_absolute_error(y_test, y_pred)
    r2     = r2_score(y_test, y_pred)

    print(f'\nTest MAE: {mae:.4f}  (lower is better, <0.10 is good)')
    print(f'Test R²:  {r2:.4f}  (higher is better, >0.70 is acceptable)')

    if mae > 0.15:
        print(
            '\nWARNING: MAE is high. This usually means not enough data, '
            'too few users, or a badly skewed label distribution.'
        )

    return model, scaler


# ── Export ───────────────────────────────────────────────────────────────────

def export_onnx(model, scaler, n_features: int) -> None:
    # Convert the trained sklearn model to ONNX format
    initial_type = [('float_input', FloatTensorType([None, n_features]))]
    onnx_model   = convert_sklearn(model, initial_types=initial_type)

    with open(MODEL_OUT, 'wb') as f:
        f.write(onnx_model.SerializeToString())

    print(f'\nModel saved → {MODEL_OUT}')

    # Save scaler parameters separately — the browser needs these to normalize
    # the raw feature vector before passing it to the ONNX model.
    # If these don't match what was used during training, every prediction will be wrong.
    scaler_params = {
        'mean': scaler.mean_.tolist(),
        'std':  scaler.scale_.tolist(),
        'features': FEATURE_COLS
    }

    with open(SCALER_OUT, 'w') as f:
        json.dump(scaler_params, f, indent=2)

    print(f'Scaler params saved → {SCALER_OUT}')
    print('\nNext step: copy both files into CLMFrontEnd/src/assets/ and wire ONNX inference in AiService.')


# ── Main ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    df             = load_data()
    validate(df)
    model, scaler  = train(df)
    export_onnx(model, scaler, n_features=len(FEATURE_COLS))