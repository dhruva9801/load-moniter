import { SessionAnalysisService } from './session-analysis';
import { LoadSample } from '../../models/load-sample.model';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Build a LoadSample without writing out the full object every time.
// t = timestamp in ms, v = load value 0–1, sh = stdHoldDeviation, sf = stdFlightDeviation.
function s(t: number, v: number, sh = 0, sf = 0): LoadSample {
  return { timestamp: t, value: v, stdHoldDeviation: sh, stdFlightDeviation: sf };
}

// Spacing between synthetic samples — 5 seconds, matching the real app's TICK_MS.
const TICK = 5_000;

// The threshold used in the real app's Live page.
const THRESHOLD = 0.7;

// ─────────────────────────────────────────────────────────────────────────────

describe('SessionAnalysisService', () => {

  // No Angular DI needed — the service is a pure class with no injected deps.
  // new it directly; this is simpler, faster, and more readable than TestBed.
  let svc: SessionAnalysisService;

  beforeEach(() => {
    svc = new SessionAnalysisService();
  });

  // ── buildSummary ────────────────────────────────────────────────────────────

  describe('buildSummary', () => {

    describe('empty samples', () => {
      it('returns zero/null values and correct duration', () => {
        const result = svc.buildSummary([], 1000, 9000, THRESHOLD);

        expect(result.sampleCount).toBe(0);
        expect(result.peakLoad).toBe(0);
        expect(result.peakAt).toBeNull();
        expect(result.totalHighLoadMs).toBe(0);
        expect(result.longestHighLoadStreakMs).toBe(0);
        expect(result.lastDropAt).toBeNull();
        expect(result.durationMs).toBe(8000);
      });
    });

    describe('peak detection', () => {
      it('identifies the correct peak value and timestamp', () => {
        const samples = [
          s(0,           0.4),
          s(TICK,        0.9),  // peak
          s(TICK * 2,    0.6),
        ];
        const result = svc.buildSummary(samples, 0, TICK * 3, THRESHOLD);

        expect(result.peakLoad).toBeCloseTo(0.9);
        expect(result.peakAt).toBe(TICK);
      });

      it('picks the first sample as peak when all values are equal', () => {
        const samples = [s(0, 0.5), s(TICK, 0.5), s(TICK * 2, 0.5)];
        const result = svc.buildSummary(samples, 0, TICK * 3, THRESHOLD);

        expect(result.peakLoad).toBeCloseTo(0.5);
        expect(result.peakAt).toBe(0);
      });

      it('correctly identifies peak at the last sample', () => {
        const samples = [s(0, 0.3), s(TICK, 0.5), s(TICK * 2, 0.95)];
        const result = svc.buildSummary(samples, 0, TICK * 3, THRESHOLD);

        expect(result.peakLoad).toBeCloseTo(0.95);
        expect(result.peakAt).toBe(TICK * 2);
      });
    });

    describe('single continuous high-load streak', () => {
      it('measures streak duration as time between samples, not number of samples', () => {
        // 3 consecutive high samples at t=0, t=5000, t=10000.
        // The streak time is the sum of gaps between consecutive high samples:
        // (5000-0) + (10000-5000) = 10000ms. NOT 3 * 5000 = 15000.
        // This is intentional — we only count time between samples, not before the first.
        const samples = [
          s(0,         0.8),
          s(TICK,      0.85),
          s(TICK * 2,  0.75),
        ];
        const result = svc.buildSummary(samples, 0, TICK * 3, THRESHOLD);

        expect(result.totalHighLoadMs).toBe(TICK * 2);         // 10000ms
        expect(result.longestHighLoadStreakMs).toBe(TICK * 2); // same, one streak
        expect(result.lastDropAt).toBeNull(); // never dropped — session ended while high
      });

      it('sets lastDropAt to null when session ends while still in a high streak', () => {
        const samples = [s(0, 0.4), s(TICK, 0.8), s(TICK * 2, 0.9)];
        const result = svc.buildSummary(samples, 0, TICK * 3, THRESHOLD);

        expect(result.lastDropAt).toBeNull();
      });
    });

    describe('load that drops below threshold', () => {
      it('records lastDropAt as the timestamp of the first sample below threshold', () => {
        const samples = [
          s(0,         0.8),
          s(TICK,      0.85),
          s(TICK * 2,  0.4),  // drop — lastDropAt should be this timestamp
        ];
        const result = svc.buildSummary(samples, 0, TICK * 3, THRESHOLD);

        expect(result.lastDropAt).toBe(TICK * 2);
      });

      it('does not count time below threshold in totalHighLoadMs', () => {
        const samples = [
          s(0,        0.8),
          s(TICK,     0.3),  // immediate drop after one high sample
          s(TICK * 2, 0.2),
        ];
        // Only one high sample — no gap to accumulate since there's no prior high sample
        const result = svc.buildSummary(samples, 0, TICK * 3, THRESHOLD);

        expect(result.totalHighLoadMs).toBe(0);
      });
    });

    describe('two separate high-load streaks', () => {
      it('sums both streaks in totalHighLoadMs and picks the longer in longestHighLoadStreakMs', () => {
        const samples = [
          s(0,          0.3),
          s(TICK,       0.8),   // streak 1 starts
          s(TICK * 2,   0.85),
          s(TICK * 3,   0.75),  // streak 1 ends — duration: 2 gaps = 10000ms
          s(TICK * 4,   0.4),   // drop
          s(TICK * 5,   0.3),
          s(TICK * 6,   0.9),   // streak 2 starts
          s(TICK * 7,   0.8),   // streak 2 ends — duration: 1 gap = 5000ms
          s(TICK * 8,   0.4),   // final drop
        ];
        const result = svc.buildSummary(samples, 0, TICK * 9, THRESHOLD);

        // Streak 1: gaps at TICK*2 and TICK*3 = 5000 + 5000 = 10000ms
        // Streak 2: gap at TICK*7 = 5000ms
        expect(result.totalHighLoadMs).toBe(15000);
        expect(result.longestHighLoadStreakMs).toBe(10000); // first streak wins
        expect(result.lastDropAt).toBe(TICK * 8);           // most recent drop
      });

      it('lastDropAt reflects the most recent drop, not the first', () => {
        const samples = [
          s(0,         0.8),
          s(TICK,      0.85),
          s(TICK * 2,  0.3),   // first drop  → t=10000
          s(TICK * 3,  0.8),
          s(TICK * 4,  0.3),   // second drop → t=20000 (this should win)
        ];
        const result = svc.buildSummary(samples, 0, TICK * 5, THRESHOLD);

        expect(result.lastDropAt).toBe(TICK * 4); // 20000, not 10000
      });
    });

    describe('session with no high-load samples', () => {
      it('returns zero streak times and null lastDropAt when load never crosses threshold', () => {
        const samples = [s(0, 0.3), s(TICK, 0.4), s(TICK * 2, 0.5)];
        const result = svc.buildSummary(samples, 0, TICK * 3, THRESHOLD);

        expect(result.totalHighLoadMs).toBe(0);
        expect(result.longestHighLoadStreakMs).toBe(0);
        expect(result.lastDropAt).toBeNull();
        expect(result.peakLoad).toBeCloseTo(0.5);
      });
    });

    describe('duration and sampleCount', () => {
      it('computes durationMs from startedAt and endedAt, independent of samples', () => {
        const result = svc.buildSummary([s(5000, 0.5)], 1000, 21000, THRESHOLD);

        expect(result.durationMs).toBe(20000);
        expect(result.startedAt).toBe(1000);
        expect(result.endedAt).toBe(21000);
      });

      it('sampleCount matches the number of samples provided', () => {
        const samples = [s(0, 0.4), s(TICK, 0.5), s(TICK * 2, 0.6)];
        const result = svc.buildSummary(samples, 0, TICK * 3, THRESHOLD);

        expect(result.sampleCount).toBe(3);
      });
    });
  });

  // ── detectErraticDecline ────────────────────────────────────────────────────

  describe('detectErraticDecline', () => {

    // All erratic-decline tests use 6 samples (the default lookback).
    // Pattern for a true trigger: low variance before peak, rising variance after.

    describe('returns false — insufficient data', () => {
      it('returns false when fewer samples than lookback', () => {
        const few = [s(0, 0.9, 0.1, 0.1), s(TICK, 0.5, 0.5, 0.5), s(TICK * 2, 0.4, 0.6, 0.6)];
        expect(svc.detectErraticDecline(few)).toBeFalse();
      });

      it('returns false with exactly 0 samples', () => {
        expect(svc.detectErraticDecline([])).toBeFalse();
      });
    });

    describe('returns false — peak not high enough', () => {
      it('returns false when peak is below the peakThreshold', () => {
        // Peak of 0.5 — below default peakThreshold of 0.65
        const samples = [
          s(0,         0.3, 0.1, 0.1),
          s(TICK,      0.4, 0.1, 0.1),
          s(TICK * 2,  0.5, 0.1, 0.1),  // "peak" but too low
          s(TICK * 3,  0.3, 0.4, 0.4),
          s(TICK * 4,  0.25, 0.5, 0.5),
          s(TICK * 5,  0.2, 0.6, 0.6),
        ];
        expect(svc.detectErraticDecline(samples)).toBeFalse();
      });
    });

    describe('returns false — peak is too recent (no room to confirm decline)', () => {
      it('returns false when peak is at the last or second-to-last position', () => {
        // Peak at index 4 (second-to-last of 6) — not enough samples after it
        const samples = [
          s(0,         0.3, 0.1, 0.1),
          s(TICK,      0.4, 0.1, 0.1),
          s(TICK * 2,  0.4, 0.1, 0.1),
          s(TICK * 3,  0.5, 0.1, 0.1),
          s(TICK * 4,  0.9, 0.1, 0.1),  // peak at index 4 — too close to end
          s(TICK * 5,  0.7, 0.5, 0.5),
        ];
        expect(svc.detectErraticDecline(samples)).toBeFalse();
      });
    });

    describe('returns false — load dropped but variance stayed flat (calm wind-down)', () => {
      it('does not trigger when variance is low and consistent after peak', () => {
        const samples = [
          s(0,         0.5, 0.1, 0.1),
          s(TICK,      0.6, 0.1, 0.1),
          s(TICK * 2,  0.85, 0.1, 0.1), // peak
          s(TICK * 3,  0.6, 0.1, 0.1),  // declining, variance flat
          s(TICK * 4,  0.5, 0.1, 0.1),
          s(TICK * 5,  0.4, 0.1, 0.1),
        ];
        // This distinguishes "taking a break after hard work" from "falling apart"
        expect(svc.detectErraticDecline(samples)).toBeFalse();
      });
    });

    describe('returns false — flow state (sustained high, no decline)', () => {
      it('does not trigger when load stays high with flat low variance throughout', () => {
        const samples = [
          s(0,         0.75, 0.05, 0.05),
          s(TICK,      0.78, 0.05, 0.05),
          s(TICK * 2,  0.80, 0.05, 0.05),
          s(TICK * 3,  0.77, 0.05, 0.05),
          s(TICK * 4,  0.75, 0.05, 0.05),
          s(TICK * 5,  0.76, 0.05, 0.05),
        ];
        // The signature case: sustained high load with stable variance = flow, not erratic
        expect(svc.detectErraticDecline(samples)).toBeFalse();
      });
    });

    describe('returns false — still climbing', () => {
      it('does not trigger when load is monotonically increasing', () => {
        const samples = [
          s(0,         0.3, 0.1, 0.1),
          s(TICK,      0.4, 0.1, 0.1),
          s(TICK * 2,  0.5, 0.15, 0.1),
          s(TICK * 3,  0.6, 0.15, 0.15),
          s(TICK * 4,  0.7, 0.2, 0.15),
          s(TICK * 5,  0.8, 0.2, 0.2),  // still climbing — peak at last position
        ];
        expect(svc.detectErraticDecline(samples)).toBeFalse();
      });
    });

    describe('returns true — genuine erratic decline', () => {
      it('triggers when load peaks then falls while variance rises', () => {
        const samples = [
          s(0,         0.5,  0.1,  0.1),
          s(TICK,      0.6,  0.1,  0.1),
          s(TICK * 2,  0.85, 0.1,  0.1),  // peak — low variance before it
          s(TICK * 3,  0.6,  0.3,  0.3),  // declining + variance rising
          s(TICK * 4,  0.5,  0.4,  0.35),
          s(TICK * 5,  0.45, 0.45, 0.4),
        ];
        expect(svc.detectErraticDecline(samples)).toBeTrue();
      });

      it('triggers with minimum viable signal — one sample before peak, two after', () => {
        // Uses a custom lookback of 4 to reduce the window size
        const samples = [
          s(0,         0.5, 0.05, 0.05),
          s(TICK,      0.9, 0.05, 0.05),  // peak at index 1
          s(TICK * 2,  0.5, 0.3,  0.3),
          s(TICK * 3,  0.4, 0.4,  0.4),
        ];
        expect(svc.detectErraticDecline(samples, { lookback: 4 })).toBeTrue();
      });
    });

    describe('opts — custom thresholds', () => {
      it('respects a custom peakThreshold', () => {
        // Peak of 0.55 — would fail the default threshold (0.65) but pass 0.5
        const samples = [
          s(0,         0.3, 0.1, 0.1),
          s(TICK,      0.4, 0.1, 0.1),
          s(TICK * 2,  0.55, 0.1, 0.1),  // peak — above custom threshold of 0.5
          s(TICK * 3,  0.3, 0.4, 0.4),
          s(TICK * 4,  0.25, 0.5, 0.5),
          s(TICK * 5,  0.2, 0.6, 0.6),
        ];
        // With default peakThreshold=0.65 → false (peak too low)
        expect(svc.detectErraticDecline(samples)).toBeFalse();
        // With custom peakThreshold=0.5 → true (peak clears the bar)
        expect(svc.detectErraticDecline(samples, { peakThreshold: 0.5 })).toBeTrue();
      });

      it('respects a custom dropFraction', () => {
        // Load drops from 0.8 to 0.75 — that's a 6.25% drop, below default 15%
        const samples = [
          s(0,         0.5, 0.1, 0.1),
          s(TICK,      0.6, 0.1, 0.1),
          s(TICK * 2,  0.8, 0.1, 0.1),  // peak
          s(TICK * 3,  0.78, 0.4, 0.4),
          s(TICK * 4,  0.76, 0.5, 0.5),
          s(TICK * 5,  0.75, 0.6, 0.6),
        ];
        // Default dropFraction=0.15 → false (not enough drop)
        expect(svc.detectErraticDecline(samples)).toBeFalse();
        // Custom dropFraction=0.05 → true (5% drop is sufficient)
        expect(svc.detectErraticDecline(samples, { dropFraction: 0.05 })).toBeTrue();
      });

      it('respects a custom lookback window', () => {
        // Build 10 samples. With lookback=10 the peak is near the middle and the trigger fires.
        // With lookback=4 (only the last 4 samples), the peak falls outside the window and it doesn't.
        const samples = [
          s(0,          0.3, 0.1, 0.1),
          s(TICK,       0.5, 0.1, 0.1),
          s(TICK * 2,   0.7, 0.1, 0.1),
          s(TICK * 3,   0.9, 0.1, 0.1),  // actual peak — index 3 of 10
          s(TICK * 4,   0.7, 0.1, 0.1),
          s(TICK * 5,   0.6, 0.3, 0.3),
          s(TICK * 6,   0.55, 0.4, 0.4),
          s(TICK * 7,   0.5, 0.5, 0.5),
          s(TICK * 8,   0.45, 0.55, 0.55),
          s(TICK * 9,   0.4, 0.6, 0.6),
        ];
        expect(svc.detectErraticDecline(samples, { lookback: 10 })).toBeTrue();
        // With lookback=4, only last 4 samples are considered — no qualifying peak in that window
        expect(svc.detectErraticDecline(samples, { lookback: 4 })).toBeFalse();
      });
    });

    describe('near-zero variance guard', () => {
      it('uses absolute difference when pre-peak variance is near zero', () => {
        // stdHoldDeviation and stdFlightDeviation are both 0 before peak.
        // avgVarBefore = 0 → falls through to the absolute-difference branch.
        // Post-peak average = 0.06, which is >= 0.05 absolute threshold → true.
        const samples = [
          s(0,         0.4, 0,    0),
          s(TICK,      0.5, 0,    0),
          s(TICK * 2,  0.9, 0,    0),  // peak, variance literally 0 before it
          s(TICK * 3,  0.6, 0.06, 0.06),
          s(TICK * 4,  0.5, 0.06, 0.06),
          s(TICK * 5,  0.45, 0.06, 0.06),
        ];
        expect(svc.detectErraticDecline(samples)).toBeTrue();
      });

      it('does not trigger when post-peak variance also stays near zero', () => {
        const samples = [
          s(0,         0.4, 0, 0),
          s(TICK,      0.5, 0, 0),
          s(TICK * 2,  0.9, 0, 0),  // peak
          s(TICK * 3,  0.6, 0, 0),  // drop but variance stays 0
          s(TICK * 4,  0.5, 0, 0),
          s(TICK * 5,  0.4, 0, 0),
        ];
        expect(svc.detectErraticDecline(samples)).toBeFalse();
      });
    });

  });

});