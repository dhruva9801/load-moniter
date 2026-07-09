# CLM — Cognitive Load Monitor

Real-time cognitive load estimation from keystroke dynamics. Fully local — no data leaves your machine.

> **Project status: complete.** CLM is a finished portfolio project, not under active development. The identified bottleneck is labeled-data collection cost (recruiting participants for NASA-TLX-labeled typing sessions is a study-logistics problem, not an engineering one), and the pipeline goals — fully local capture, training, and browser inference — were met. See [Status and future directions](#status-and-future-directions) for what continuation would look like.

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
| Architecture | Random Forest Regressor (Linear Regression evaluated as comparison) |
| Features | 6 keystroke features: `meanHold`, `stdHold`, `meanFlight`, `stdFlight`, `typingSpeed`, `backspaceRate` |
| Training data | 244 rows across **7 task sessions**, single user — one NASA-TLX label per session, so the effective sample size is **7 labeled tasks**, not 244 rows |
| Evaluation | Leave-one-session-out CV (7 folds), pooled out-of-fold metrics |
| Pooled R² (RF) | **−0.13** |
| Pooled MAE (RF) | 0.21 (on a 0–1 load scale) |

**Leakage-free baseline comparison (leave-one-session-out, pooled):**

| Model | Pooled R² | Pooled MAE |
|---|---|---|
| Linear Regression | −0.08 | 0.21 |
| Random Forest | −0.13 | 0.21 |
| Predict-train-mean baseline | −0.34 | 0.24 |

The honest conclusion: **the model does not have deployable predictive skill on unseen sessions.** Negative pooled R² means its predictions are worse than a constant guess at the global mean load. It does beat the predict-train-mean baseline on both metrics, and its out-of-fold predictions correctly rank the two lowest-load sessions lowest — so a faint low-end signal exists — but it collapses at the high end (the 0.85-load session received a mean prediction of 0.53). Predictions span only 0.44–0.65 while true labels span 0.125–0.85: severe regression to the mean. Notably, Linear Regression out-generalizes the Random Forest at this sample size — with an effective n of 7, the lower-variance model wins, a textbook bias–variance result observed in the project's own data.

**Known limitations (and one important correction):**

Earlier iterations of this project reported a single-split R² of 0.41 and an ungrouped 5-fold CV R² of 0.30 ± 0.12. **Both numbers were inflated by session leakage.** Because every window in a session carries the session's single NASA-TLX label, any split that places windows from the same session in both train and test allows the model to identify *which session* a window came from (typing rhythm is highly distinctive within a session) and retrieve its memorized label — session fingerprinting, not load prediction. In deployment, every session is unseen, so the only valid evaluation is leave-one-session-out. The discredited numbers are recorded here deliberately, as documentation of the evaluation error and its correction.

The bottleneck is labeled-session count, not architecture or hyperparameters: GridSearchCV over 45 combinations produced no meaningful improvement, and no model class can be expected to generalize from 7 labeled tasks. Diagnostics — LOSO evaluation for RF, LR, and a predict-train-mean baseline, feature importances, and per-session error analysis — are reproducible via `python training/analyze_model.py`.

**Feature importances:**

| Feature | Importance |
|---|---|
| meanHold | 0.37 |
| typingSpeed | 0.19 |
| meanFlight | 0.14 |
| stdHold | 0.13 |
| stdFlight | 0.09 |
| backspaceRate | 0.08 |

`meanHold` and `typingSpeed` account for over half the predictive signal on the current single-user dataset. Given the sample size, these rankings should be read as rough tendencies, not stable estimates.

---

## Design history and lessons learned

CLM did not start as a keystroke project, and two of its most important engineering decisions were about **removing** things.

**The MediaPipe pivot.** The original design estimated cognitive load from facial landmarks using MediaPipe FaceMesh via the webcam. This was abandoned for two reasons: facial expression is a weak, noisy proxy for cognitive load (people concentrate with neutral faces, and expression varies far more across individuals than typing rhythm does), and FaceMesh is built for AR-style geometry tracking, not affective or cognitive state inference — using it for load estimation meant building on a tool designed for a different problem. Keystroke dynamics won because the signal is closer to the phenomenon: motor timing degrades measurably under load, and the capture is passive with no camera privacy cost.

**Removing federated learning.** An early version included a federated learning component intended to aggregate model updates across users. It was removed entirely after review revealed it was treating raw ONNX model bytes as weight arrays — which is not how FL aggregation works — and, more fundamentally, that FL was solving a problem the project didn't have: with one user and 244 rows, there was nothing to federate. Deleting it simplified the architecture and was the right call; complexity that doesn't serve the data you actually have is a liability.

**Fixing fabricated labels.** The first training pipeline contained hardcoded stub values and synthetic labels in the keystroke service. These were replaced with real task-based NASA-TLX self-ratings, which is why the dataset is small — every row is a genuinely labeled session. A small honest dataset with a mediocre R² was chosen over a large fabricated one with an impressive-looking score.

**Fixing the evaluation.** The most consequential bug in the project was not in the model or the pipeline — it was in the evaluation. Reported performance (single-split R² 0.41, ungrouped 5-fold CV 0.30) looked respectable until the data geometry was examined: with one label per session, ungrouped splits let the model fingerprint sessions instead of predicting load. Rebuilding the evaluation as leave-one-session-out with pooled out-of-fold metrics, plus a predict-train-mean floor baseline, revealed the true generalization performance was negative R². The lesson: evaluation bugs fail silently by making numbers *better*, and the effective sample size of a dataset is set by its labels, not its rows.

**Knowing when to stop.** After the corrected evaluation established that no model class can generalize from 7 labeled tasks, the options were (a) recruit participants for labeled typing sessions — a human-subjects data-collection effort with a cost far exceeding the project's remaining learning value — or (b) declare the pipeline complete. The project stopped at (b), deliberately.

---

## Setup

### Requirements

- Python 3.9+
- Node 18+
- macOS, Windows, or Linux (see the macOS permissions note below — it will bite you)

### 1. Run the agent

```bash
cd CLMPython
pip install -r requirements.txt
python clm_agent.py
```

The agent opens a WebSocket on `ws://localhost:8765` and streams raw keystroke events to the browser. Keep it running in the background while CLM is open.

> **macOS:** `pynput` requires Accessibility permissions. Grant them under **System Settings → Privacy & Security → Accessibility** for your terminal app (Terminal, iTerm, VS Code, etc.). Without this the agent runs without error but captures **zero keystrokes** — this is the most common "it doesn't work" cause.

### 2. Run the frontend

```bash
cd CLMFrontEnd
npm install
npx ng serve
```

Open `http://localhost:4200`. (`npx` runs the project-local Angular CLI — no global install needed.)

### 3. Calibrate

On first launch, CLM runs a 30-second baseline calibration to learn your resting typing rhythm. Click "Start Calibration" and type normally until it completes.

### Troubleshooting

| Symptom | Cause |
|---|---|
| Gauge never moves, no errors anywhere | macOS Accessibility permissions not granted (see above) |
| Frontend shows "agent disconnected" | `clm_agent.py` isn't running, or something else is bound to port 8765 |
| `ng: command not found` | You ran `ng serve` instead of `npx ng serve` |

---

## Running the tests

```bash
cd CLMFrontEnd
npx ng test
```

23 Jasmine unit tests cover session analysis (break detection, summary statistics) and keystroke feature extraction.

---

## Training your own model

After collecting labeled data in Training Mode:

1. Export your CSV from the Training Mode dashboard
2. Place it in `training/data/`
3. Run `python training/combine_and_train.py` (dependencies in `training/requirements.txt`)
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

## Status and future directions

CLM is **complete**. Development stopped deliberately after leakage-free evaluation established that the model cannot generalize from 7 labeled tasks, and that collecting more NASA-TLX-labeled sessions is a participant-recruitment problem whose cost exceeds the project's remaining learning value.

If the project were continued, the roadmap would be:

- **More labeled sessions, then more users** — the binding constraint is labeled-session count (effective n = 7), and after that, single-user data; both cap generalization long before model choice matters
- **Leave-one-user-out cross-validation** — the honest generalization estimate once 3+ users exist, for the same reason leave-one-session-out is required within one user
- **Window quality filtering** — near-idle 5-second windows (a handful of keystrokes) produce degenerate timing statistics and should be dropped before training
- **Simpler models first** — Linear Regression already out-generalized the Random Forest at this sample size; more capacity (XGBoost, neural nets) is the wrong direction until the data grows by an order of magnitude

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
│   ├── clm_agent.py      OS keystroke capture → WebSocket
│   └── requirements.txt
└── training/
    ├── combine_and_train.py   Data prep + RF training + ONNX export
    ├── analyze_model.py       Diagnostic: feature importance, CV, error analysis
    ├── requirements.txt
    └── data/                  Per-session labeled CSVs
```

---

## License

MIT — see [LICENSE](LICENSE).