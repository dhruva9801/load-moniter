# CLM — Cognitive Load Monitor

Real-time cognitive load estimation from keystroke dynamics. Fully local — no data leaves your machine.

---

## What it does

CLM passively captures your keystroke timing in 5-second windows and runs an on-device Random Forest model to estimate cognitive load on a 0–1 scale. It runs in your browser, communicates with a local Python agent (`clm_agent.py`) that hooks into your OS keyboard events via `pynput`, and performs all inference via ONNX Runtime in the browser.

Two modes:

- **Training Mode** — label tasks with NASA-TLX ratings after you finish them, building a personal training dataset used to retrain the model
- **Live Mode** — passive monitoring, real-time load score, session history chart, and break notifications when load degrades

---

## Model performance

| Metric | Value |
|---|---|
| Architecture | Random Forest Regressor |
| Features | 6 keystroke features (hold time, flight time, typing speed, backspace rate, and their variances) |
| Training data | 244 rows, single user |
| Cross-validated R² | 0.30 ± 0.12 (5-fold) |
| Cross-validated MAE | 0.15 ± 0.01 |
| Single-split R² | 0.41 (reported for reference; CV estimate is more honest) |

**Known limitations:**

The cross-validation R² of 0.30 with ±0.12 standard deviation reveals that the single-split R² of 0.41 was a favorable draw, not a stable estimate. Error analysis shows the model systematically underestimates high-load states (mean prediction 0.65 when actual is 0.81) and overestimates low-load states (mean prediction 0.37 when actual is 0.18) — a classic regression-to-the-mean effect from leaf-averaging regularization under limited data. The bottleneck is data volume, not architecture or hyperparameter choice (GridSearchCV over 45 combinations confirmed no meaningful improvement over the baseline hyperparams at this dataset size).

All five diagnostic steps have been run: feature importance, hyperparameter tuning, baseline comparison (Linear Regression R²=0.26 vs RF R²=0.41), error analysis by load bin, and cross-validation. Output is in `training/analyze_model.py`.

**Feature importances:**

| Feature | Importance |
|---|---|
| meanHold | 0.43 |
| typingSpeed | 0.24 |
| meanFlight | 0.10 |
| stdHold | 0.10 |
| backspaceRate | 0.07 |
| stdFlight | 0.06 |

`meanHold` and `typingSpeed` account for 67% of predictive signal on the current dataset. This may shift as more users are added.

---

## Setup

### Requirements

- Python 3.9+
- Node 18+
- `pynput` (`pip install pynput`)

### 1. Run the agent

```bash
cd CLMPython
python clm_agent.py
```

The agent opens a WebSocket on `ws://localhost:8765` and streams raw keystroke events to the browser. Keep it running in the background while CLM is open.

### 2. Run the frontend

```bash
cd CLMFrontEnd
npm install
ng serve
```

Open `http://localhost:4200`.

### 3. Calibrate

On first launch, CLM runs a 30-second baseline calibration to learn your resting typing rhythm. Click "Start Calibration" and type normally until it completes.

---

## Training your own model

After collecting labeled data in Training Mode:

1. Export your CSV from the Training Mode dashboard
2. Place it in `training/data/`
3. Run `python training/combine_and_train.py`
4. Copy the output `keystroke_model.onnx` and `scaler_params.json` into `CLMFrontEnd/src/assets/models/`
5. Reload the app

The training script also runs `StandardScaler` normalization and exports scaler parameters alongside the model so browser inference stays consistent with training.

---

## Architecture decisions

**Fully local.** No backend, no server, no telemetry. Keystroke data is sensitive — the on-device architecture is a deliberate privacy choice, not a convenience.

**ONNX for browser inference.** The trained sklearn Random Forest is exported to ONNX and run in the browser via `onnxruntime-web`. This avoids a backend inference server entirely.

**OS-level keystroke capture via pynput.** The Chrome extension approach was considered and rejected — browser keystroke events are throttled and don't give the hold-time and flight-time resolution needed for feature extraction. The Python agent captures at the OS level and streams over WebSocket.

**Deviation-based features excluded from model input.** The CSV logs contain derived deviation columns (`speedDrop`, `holdIncrease`, etc.) but these are intentionally excluded from `FEATURE_COLS` in training — the model learns those relationships itself from the raw features, rather than receiving pre-cooked deviations that would encode assumptions about linearity.

**Break detection uses two separate triggers:**
- *Sustained high load* — 4 consecutive high-load windows (~20s)
- *Erratic decline* — load peaked and is now falling while typing variance (`stdHoldDeviation`, `stdFlightDeviation`) is rising. This is a closer proxy for real degradation vs the sustained-high trigger, which is ambiguous (high sustained load looks the same whether it's flow or overload).

---

## What's next

- Multi-user data collection (current single-user limitation is the primary bottleneck for generalization)
- Leave-one-user-out cross-validation once data from 3+ users is available
- XGBoost comparison — likely to outperform RF on keystroke data at moderate data sizes

---

## Project structure

```
CLM/
├── CLMFrontEnd/          Angular 20 app
│   └── src/app/
│       ├── features/
│       │   ├── landing/      Home screen
│       │   ├── dashboard/    Training mode
│       │   └── live/         Live monitoring + session summary
│       ├── shared/
│       │   ├── components/
│       │   │   ├── attention-meter/   SVG load gauge
│       │   │   ├── load-chart/        Session history line chart
│       │   │   ├── calibration/       Baseline calibration flow
│       │   │   └── tlx-prompt/        NASA-TLX rating overlay
│       │   └── ...
│       └── core/services/
│           ├── ai.ts             ONNX inference + heuristic fallback
│           ├── keystroke.ts      WebSocket agent bridge + feature extraction
│           ├── baseline.ts       Calibration + baseline persistence
│           ├── data-logger.ts    CSV logging + TLX label application
│           └── session-analysis.ts  Break detection + session summary stats
├── CLMPython/
│   └── clm_agent.py      OS keystroke capture → WebSocket
└── training/
    ├── combine_and_train.py   Data prep + RF training + ONNX export
    ├── analyze_model.py       Diagnostic: feature importance, CV, error analysis
    └── data/                  Per-session labeled CSVs
```