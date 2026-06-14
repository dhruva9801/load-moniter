import { Injectable } from '@angular/core';
import { CognitiveFeatures } from '../../models/cognitive-features.model';
import { UserBaseline } from '../../models/user-baseline.model';

export interface Score {
  value:            number; // cognitive load estimate 0–1
  confidence:       number; // 1.0 = baseline available, 0.5 = raw fallback
  speedDrop:        number; // deviation features exposed so data-logger can store them
  holdIncrease:     number;
  flightIncrease:   number;
  stdHoldDeviation: number;
  stdFlightDeviation: number;
}

@Injectable({ providedIn: 'root' })
export class AiService {

  computeScore(features: CognitiveFeatures, baseline: UserBaseline | null): Score {
    if (baseline) {
      return this.deviationScore(features, baseline);
    }
    return this.rawHeuristic(features);
  }

  private deviationScore(features: CognitiveFeatures, baseline: UserBaseline): Score {

    // How much slower than baseline? Positive = slower = more load.
    const speedDrop = baseline.typingSpeed > 0
      ? (baseline.typingSpeed - features.typingSpeed) / baseline.typingSpeed
      : 0;

    // How much longer are holds? Positive = holding longer = more load.
    const holdIncrease = baseline.meanHold > 0
      ? (features.meanHold - baseline.meanHold) / baseline.meanHold
      : 0;

    // How much bigger are flight gaps? Positive = more hesitation = more load.
    const flightIncrease = baseline.meanFlight > 0
      ? (features.meanFlight - baseline.meanFlight) / baseline.meanFlight
      : 0;

    // How much more variable are holds? Positive = more erratic = more load.
    const stdHoldDeviation = baseline.stdHold > 0
      ? (features.stdHold - baseline.stdHold) / baseline.stdHold
      : 0;

    // How much more variable are flight times? Positive = more erratic = more load.
    const stdFlightDeviation = baseline.stdFlight > 0
      ? (features.stdFlight - baseline.stdFlight) / baseline.stdFlight
      : 0;

    // backspaceRate needs no normalization — it's already a ratio.
    // Weight it equally with the other signals.
    const raw = (
      speedDrop +
      holdIncrease +
      flightIncrease +
      stdHoldDeviation +
      stdFlightDeviation +
      features.backspaceRate  // e.g. 0.15 = 15% of keystrokes were backspaces
    ) / 6;

    // Center around 0.5 at baseline, scale deviations into 0–1 range
    const value = Math.min(1, Math.max(0, 0.5 + raw * 0.5));

    return { value, confidence: 1, speedDrop, holdIncrease, flightIncrease, stdHoldDeviation, stdFlightDeviation };
  }

  private rawHeuristic(features: CognitiveFeatures): Score {
    const speedNorm      = Math.min(features.typingSpeed / 400, 1);
    const flightVariance = Math.min(features.stdFlight / 500, 1);
    const value          = Math.min(1, Math.max(0,
      0.4 * (1 - speedNorm) + 0.4 * flightVariance + 0.2 * features.backspaceRate
    ));
    return { value, confidence: 0.5, speedDrop: 0, holdIncrease: 0, flightIncrease: 0, stdHoldDeviation: 0, stdFlightDeviation: 0 };
  }
}