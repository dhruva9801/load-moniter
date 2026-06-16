import { Injectable } from '@angular/core';
import { CognitiveFeatures } from '../../models/cognitive-features.model';
import { UserBaseline } from '../../models/user-baseline.model';
import * as ort from 'onnxruntime-web';

export interface Score {
  value:               number;  // cognitive load estimate 0–1
  confidence:          number;  // 1.0 = ONNX model, 0.8 = heuristic+baseline, 0.5 = raw fallback
  source:              'onnx' | 'heuristic';
  speedDrop:           number;
  holdIncrease:        number;
  flightIncrease:      number;
  stdHoldDeviation:    number;
  stdFlightDeviation:  number;
}

interface ScalerParams {
  mean:     number[];
  std:      number[];
  features: string[];
}

const MODEL_PATH  = 'assets/models/keystroke_model.onnx';
const SCALER_PATH = 'assets/models/scaler_params.json';

// Feature order must match FEATURE_COLS in combine_and_train.py exactly.
// If these are out of order the model receives wrong inputs and predictions are garbage.
const FEATURE_ORDER: (keyof CognitiveFeatures)[] = [
  'meanHold',
  'stdHold',
  'meanFlight',
  'stdFlight',
  'typingSpeed',
  'backspaceRate',
];

@Injectable({ providedIn: 'root' })
export class AiService {

  private session:      ort.InferenceSession | null = null;
  private scaler:       ScalerParams | null = null;
  private modelReady  = false;
  private loadAttempted = false;

  constructor() {
    // Point onnxruntime-web at the wasm files in assets.
    // Without this it tries to fetch them from the CDN, which fails offline.
    ort.env.wasm.wasmPaths = 'assets/ort/';
    this.loadModel();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get isUsingOnnx(): boolean { return this.modelReady; }

  computeScore(features: CognitiveFeatures, baseline: UserBaseline | null): Score {
    // ONNX path — only used once model is loaded and scaler params are available
    if (this.modelReady && this.scaler) {
      return this.onnxScore(features, baseline);
    }

    // Heuristic fallback — used until model loads, or if model fails to load
    if (baseline) {
      return this.deviationScore(features, baseline);
    }

    return this.rawHeuristic(features);
  }

  // ── ONNX ───────────────────────────────────────────────────────────────────

  private async loadModel(): Promise<void> {
    if (this.loadAttempted) return;
    this.loadAttempted = true;

    try {
      // Load scaler params first — no point loading the model without them
      const scalerRes = await fetch(SCALER_PATH);
      if (!scalerRes.ok) throw new Error(`Scaler fetch failed: ${scalerRes.status}`);
      this.scaler = await scalerRes.json();

      // Validate that the scaler feature order matches what we expect
      const scalerFeatures = this.scaler!.features.join(',');
      const expectedFeatures = FEATURE_ORDER.join(',');
      if (scalerFeatures !== expectedFeatures) {
        throw new Error(
          `Scaler feature order mismatch.\n` +
          `Expected: ${expectedFeatures}\n` +
          `Got:      ${scalerFeatures}\n` +
          `Retrain the model — falling back to heuristic.`
        );
      }

      this.session    = await ort.InferenceSession.create(MODEL_PATH);
      this.modelReady = true;
      console.log('[AiService] ONNX model loaded successfully.');

    } catch (err) {
      // Non-fatal — heuristic takes over automatically
      console.warn('[AiService] ONNX model failed to load, using heuristic fallback:', err);
      this.modelReady = false;
    }
  }

  private onnxScore(features: CognitiveFeatures, baseline: UserBaseline | null): Score {
    // Build raw feature vector in the exact order the model was trained on
    const raw = FEATURE_ORDER.map(k => features[k] as number);

    // Apply StandardScaler normalization: (x - mean) / std
    // This must match what combine_and_train.py did during training
    const scaled = raw.map((v, i) =>
      (v - this.scaler!.mean[i]) / (this.scaler!.std[i] || 1)
    );

    const tensor = new ort.Tensor('float32', Float32Array.from(scaled), [1, scaled.length]);

    // Run inference synchronously via a queued microtask
    // We return immediately with a heuristic score then update on the next tick
    // This avoids blocking the main thread during inference
    this.runInference(tensor);

    // While waiting for first inference, return heuristic so UI isn't empty
    const heuristicResult = baseline
      ? this.deviationScore(features, baseline)
      : this.rawHeuristic(features);

    return heuristicResult;
  }

  private lastOnnxValue: number | null = null;

  private async runInference(tensor: ort.Tensor): Promise<void> {
    try {
      const results  = await this.session!.run({ float_input: tensor });
      const output   = results[Object.keys(results)[0]];
      this.lastOnnxValue = Math.min(1, Math.max(0, (output.data as Float32Array)[0]));
    } catch (err) {
      console.warn('[AiService] Inference failed:', err);
    }
  }

  // ── Heuristic fallback (unchanged) ────────────────────────────────────────

  private deviationScore(features: CognitiveFeatures, baseline: UserBaseline): Score {
    const speedDrop = baseline.typingSpeed > 0
      ? (baseline.typingSpeed - features.typingSpeed) / baseline.typingSpeed : 0;

    const holdIncrease = baseline.meanHold > 0
      ? (features.meanHold - baseline.meanHold) / baseline.meanHold : 0;

    const flightIncrease = baseline.meanFlight > 0
      ? (features.meanFlight - baseline.meanFlight) / baseline.meanFlight : 0;

    const stdHoldDeviation = baseline.stdHold > 0
      ? (features.stdHold - baseline.stdHold) / baseline.stdHold : 0;

    const stdFlightDeviation = baseline.stdFlight > 0
      ? (features.stdFlight - baseline.stdFlight) / baseline.stdFlight : 0;

    const raw = (
      speedDrop + holdIncrease + flightIncrease +
      stdHoldDeviation + stdFlightDeviation + features.backspaceRate
    ) / 6;

    // If we have a recent ONNX result, blend it in (80% ONNX, 20% heuristic)
    // This gives a smooth transition once the model's first inference completes
    const heuristicValue = Math.min(1, Math.max(0, 0.5 + raw * 0.5));
    const value = this.lastOnnxValue !== null
      ? 0.8 * this.lastOnnxValue + 0.2 * heuristicValue
      : heuristicValue;

    const source = this.lastOnnxValue !== null ? 'onnx' : 'heuristic';
    const confidence = this.lastOnnxValue !== null ? 1.0 : 0.8;

    return { value, confidence, source, speedDrop, holdIncrease, flightIncrease, stdHoldDeviation, stdFlightDeviation };
  }

  private rawHeuristic(features: CognitiveFeatures): Score {
    const speedNorm      = Math.min(features.typingSpeed / 400, 1);
    const flightVariance = Math.min(features.stdFlight / 500, 1);
    const value          = Math.min(1, Math.max(0,
      0.4 * (1 - speedNorm) + 0.4 * flightVariance + 0.2 * features.backspaceRate
    ));
    return {
      value, confidence: 0.5, source: 'heuristic',
      speedDrop: 0, holdIncrease: 0, flightIncrease: 0,
      stdHoldDeviation: 0, stdFlightDeviation: 0
    };
  }
}