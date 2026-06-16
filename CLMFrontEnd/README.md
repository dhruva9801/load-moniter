# Cognitive Load Monitor (CLM)

A research tool that estimates cognitive load in real time using keystroke dynamics. Data collected is used to train a machine learning model.

---

## Project Structure

```
CLM/
├── CLMFrontEnd/     — Angular web app (dashboard, calibration, data export)
├── CLMPython/
│   └── clm_agent/
│       └── clm_agent.py  — Python keystroke capture agent
└── training/
    ├── combine_and_train.py  — combines CSVs and trains the ONNX model
    ├── requirements.txt
    ├── data/                 — drop exported CSVs here (git-ignored)
    └── models/               — trained ONNX output goes here
```

---

## Requirements

- Node.js 18+
- Python 3.9+
- Chrome (or any modern browser)

---

## Running the App

You need two things running at the same time: the Python agent and the Angular app.

### 1. Start the keystroke agent

```bash
cd CLMPython/clm_agent
pip install pynput websockets
python clm_agent.py
```

Leave this running in the background. It listens on `ws://localhost:8765` and captures keystrokes system-wide.

### 2. Start the frontend

```bash
cd CLMFrontEnd
npm install
npm start
```

Open `http://localhost:4200` in your browser.

---

## Collecting Data

1. Open the app — you'll be asked to enter a user ID (use your name or initials, keep it consistent)
2. Complete the 30-second calibration (just type normally)
3. Click **Start Task** before you begin working on something
4. Click **Done — Rate this task** when you finish to submit a NASA-TLX rating
5. Repeat across multiple sessions until you have 200+ labeled rows
6. Click **Export labeled CSV** and send the file to the project lead

---

## Training the Model

Once you have CSVs from multiple collaborators:

```bash
cd training
pip install -r requirements.txt
```

Drop all CSV files into `training/data/`, then:

```bash
python combine_and_train.py
```

This outputs `models/keystroke_model.onnx` and `models/scaler_params.json`. Copy both into `CLMFrontEnd/src/assets/models/` and the app will automatically use the trained model instead of the heuristic.

---

## Notes

- The dashboard shows **"ONNX"** or **"Heuristic"** in the metrics grid so you always know which inference path is active
- Raw CSV files are git-ignored — never commit personal typing data
- If the agent disconnects, the dashboard shows a warning — restart `clm_agent.py` to reconnect