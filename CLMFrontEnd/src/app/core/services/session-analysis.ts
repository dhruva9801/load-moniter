import { Injectable } from '@angular/core';
import { LoadSample, SessionSummary } from '../../models/load-sample.model';

@Injectable({ providedIn: 'root' })
export class SessionAnalysisService {

  /**
   * Builds a SessionSummary from a flat array of LoadSamples.
   * Pure function — no side effects, easy to unit test independent of the
   * live page's timer/websocket plumbing.
   */
  buildSummary(
    samples: LoadSample[],
    startedAt: number,
    endedAt: number,
    highLoadThreshold: number
  ): SessionSummary {

    if (samples.length === 0) {
      return {
        startedAt, endedAt,
        durationMs: endedAt - startedAt,
        peakLoad: 0,
        peakAt: null,
        totalHighLoadMs: 0,
        longestHighLoadStreakMs: 0,
        lastDropAt: null,
        sampleCount: 0
      };
    }

    // Peak load + when it happened
    let peakLoad = samples[0].value;
    let peakAt   = samples[0].timestamp;
    for (const s of samples) {
      if (s.value > peakLoad) {
        peakLoad = s.value;
        peakAt   = s.timestamp;
      }
    }

    // Walk the samples in order, tracking high-load streaks.
    // A "streak" is a contiguous run of samples >= threshold. We sum the time
    // between consecutive high samples within a streak (not a fixed tick size)
    // so this stays correct even if the polling interval ever changes.
    let totalHighLoadMs        = 0;
    let longestHighLoadStreakMs = 0;
    let currentStreakMs        = 0;
    let lastDropAt: number | null = null;
    let prevSample: LoadSample | null = null;
    let wasHigh = false;

    for (const s of samples) {
      const isHigh = s.value >= highLoadThreshold;

      if (isHigh && prevSample && wasHigh) {
        // Continuing a streak — add the gap since the previous sample
        const gap = s.timestamp - prevSample.timestamp;
        currentStreakMs += gap;
        totalHighLoadMs += gap;
      }

      if (wasHigh && !isHigh) {
        // Just dropped out of high load — close out the streak
        longestHighLoadStreakMs = Math.max(longestHighLoadStreakMs, currentStreakMs);
        currentStreakMs = 0;
        lastDropAt = s.timestamp;
      }

      wasHigh    = isHigh;
      prevSample = s;
    }
    // Close out a streak still in progress when the session ended
    longestHighLoadStreakMs = Math.max(longestHighLoadStreakMs, currentStreakMs);

    return {
      startedAt, endedAt,
      durationMs: endedAt - startedAt,
      peakLoad,
      peakAt,
      totalHighLoadMs,
      longestHighLoadStreakMs,
      lastDropAt,
      sampleCount: samples.length
    };
  }

  /**
   * Erratic-decline detection.
   *
   * This is deliberately NOT the same trigger as "sustained high load."
   * Sustained high load alone is ambiguous — it looks the same whether the
   * person is in flow or quietly overloaded, and there's no feature in this
   * app that tells those two states apart on its own.
   *
   * What IS a real signal: load was recently high and is now FALLING, while
   * typing variance (stdHoldDeviation / stdFlightDeviation) is RISING. Rising
   * variance after a peak means typing rhythm is breaking down — hesitation,
   * corrections, inconsistent pacing — which is a more honest proxy for
   * "this person is losing it" than "the number stayed above 0.7."
   *
   * Returns true on the tick where the pattern is first detected, so the
   * caller can show a one-shot prompt rather than retriggering every tick.
   */
  detectErraticDecline(
    recentSamples: LoadSample[],
    opts: {
      lookback?: number;          // how many recent samples to consider
      peakThreshold?: number;     // load level that counts as "was high"
      dropFraction?: number;      // how much below peak counts as "now declining"
      varianceRiseFraction?: number; // how much stdDeviation must rise vs the peak window
    } = {}
  ): boolean {
    const lookback             = opts.lookback ?? 6;
    const peakThreshold        = opts.peakThreshold ?? 0.65;
    const dropFraction         = opts.dropFraction ?? 0.15;
    const varianceRiseFraction = opts.varianceRiseFraction ?? 0.2;

    if (recentSamples.length < lookback) return false;

    const window = recentSamples.slice(-lookback);

    // Find the peak load sample within this window and its index
    let peakIdx = 0;
    for (let i = 1; i < window.length; i++) {
      if (window[i].value > window[peakIdx].value) peakIdx = i;
    }
    const peak = window[peakIdx];

    // Peak has to actually be high, and has to have happened before the end
    // of the window (otherwise we're still climbing, not declining)
    if (peak.value < peakThreshold) return false;
    if (peakIdx >= window.length - 2) return false; // need room after the peak to see a decline

    const latest = window[window.length - 1];

    const hasDropped = latest.value <= peak.value * (1 - dropFraction);
    if (!hasDropped) return false;

    // Compare average variance-deviation before the peak vs after it
    const before = window.slice(0, peakIdx + 1);
    const after  = window.slice(peakIdx + 1);

    const avgVarBefore = average(before.map(s => (s.stdHoldDeviation + s.stdFlightDeviation) / 2));
    const avgVarAfter  = average(after.map(s => (s.stdHoldDeviation + s.stdFlightDeviation) / 2));

    // Guard against division by ~0 — if there was barely any variance before,
    // require an absolute rise instead of a fragile percentage comparison.
    const varianceRose = avgVarBefore > 0.05
      ? avgVarAfter >= avgVarBefore * (1 + varianceRiseFraction)
      : avgVarAfter - avgVarBefore >= 0.05;

    return varianceRose;
  }
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}