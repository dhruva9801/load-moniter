**CLM — Cognitive Load Monitor**
Real-time cognitive load estimation from keystroke dynamics. Fully local

**Project status and future plans:**
Working but incomplete because of the bottleneck of data collection from too many people through NASA-TLX-labeled sessions along with a recent hardware failure that wiped the raw labeled dataset. I plan to get new data and then fix the window quality filtering where near-idle 5-second windows are useless statistics and make a dropping mechanism and I want to integrate pupil diameter and blink dynamics though webcam-based capture that isn't MediaPipe. I also want to redo the feature engineering as the current six keystroke features were just easy to get and not super optimized to track cognitive load.

**What it does and how it works:**
CLM passively captures your keystroke timing in 5-second windows and runs an on-device Random Forest model to estimate cognitive load on a 0–1 scale. It runs in your browser, communicates with a local Python agent (clm_agent.py) that looks at your OS keyboard events via pynput, and performs all inference via ONNX Runtime in the browser.
Two modes:
Training Mode — label tasks with NASA-TLX ratings after you finish them, building a personal training dataset used to retrain the model
Live Mode — passive monitoring, real-time load score, session history chart, and break notifications when load degrades

**Model performance:**
Architecture: Random Forest Regressor (Linear Regression evaluated as comparison)
Feature importance: 6 keystroke features: meanHold 0.37, stdHold 0.19, meanFlight 0.14, stdFlight 0.13, typingSpeed 0.09, backspaceRate 0.08
Training data: 244 rows across 7 task sessions, single user — one NASA-TLX label per session, so the effective sample size is 7 labeled tasks, not 244 rows
Evaluation: Leave-one-session-out CV (7 folds), pooled out-of-fold metrics
Pooled R² (RF)	−0.13
Pooled MAE (RF)	0.21 (on a 0–1 load scale)

**Leakage-free baseline comparison (leave-one-session-out, pooled):**
Linear Regression Pooled R²: −0.08 Pooled MAE: 0.21
Random Forest Pooled R²: −0.13 Pooled MAE: 0.21
Predict-train-mean baseline Pooled R²: −0.34 Pooled MAE: 0.24

**The honest conclusion:**
the model doesnt have deployable predictive skill on unseen sessions since it has a negative pooled R². Predictions span only 0.44–0.65 so there is regression to the mean. Linear Regression out-generalizes the Random Forest at this sample size and the bottleneck is labeled-session count. GridSearchCV over 45 combinations produced no meaningful improvement, and no model class can be expected to generalize from 7 labeled tasks.

**Design history and lessons learned:**
The original approach used MediaPipe FaceMesh to estimate cognitive load from facial expressions, which I got rid of and switched to keystroke only because FaceMesh runs inference on every video frame in the browser and slowed typing. The first training pipeline was hardcoded with labels that I thought looked right which I replaced with real task-based NASA-TLX self-ratings. Then I realized the original cross-validation used ungrouped KFold on a dataset where every row from a single task shared the same label so train and test sets had rows from the same session with the same labels. The model was learning to recognize within-session typing consistency, not cognitive load. Correcting to leave-one-session-out CV revealed that 244 rows sharing 7 distinct labels and all models scored negative R² against a predict-mean baseline. I learned the real difficulty of data engineering

**Setup:** 
Requirements
Python 3.9+
Node 18+
macOS, Windows, or Linux 
1. Run the agent
cd CLMPython
pip install -r requirements.txt
python clm_agent.py
The agent opens a WebSocket on ws://localhost:8765 and streams raw keystroke events to the browser. Keep it running in the background while CLM is open.

2. Run the frontend
cd CLMFrontEnd
npm install
npx ng serve
Open http://localhost:4200.
On first launch, CLM runs a 30-second baseline calibration to learn your resting typing rhythm. 
23 Jasmine unit tests cover session analysis (break detection, summary statistics) and keystroke feature extraction.

**Training your own model:**
after getting labeled data, export your CSV from the Training Mode dashboard
Place it in training/data/
Run python training/combine_and_train.py (dependencies in training/requirements.txt)
Copy the output keystroke_model.onnx and scaler_params.json into CLMFrontEnd/src/assets/models/
Reload the app


Architecture decisions:
Fully local since keystroke data is private, ONNX for browser inference, The trained sklearn Random Forest is exported to ONNX and run in the browser via onnxruntime-web which avoids a backend inference server, OS-level keystroke capture via pynput, python agent captures at the OS level and streams over WebSocket.

Break detection uses two separate triggers:
Sustained high load — 4 consecutive high-load windows (~20s)
Erratic decline — load peaked and is now falling while typing variance (stdHoldDeviation, stdFlightDeviation) is rising
