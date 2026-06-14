// Captures a user's natural resting typing patterns.
// Recorded during a calm 5-minute calibration session.
// Every scored window is measured as deviation from these values.

export interface UserBaseline {
  meanHold:    number; // average hold duration at rest (ms)
  stdHold:     number; // hold variance at rest
  meanFlight:  number; // average flight time at rest (ms)
  stdFlight:   number; // flight variance at rest
  typingSpeed: number; // natural typing speed at rest (kpm)
  capturedAt:  number; // epoch ms — lets you detect a stale baseline
}