// One 5-second window of keystroke measurements.
// This is the raw input before deviation normalization.

export interface CognitiveFeatures {
  meanHold:      number; // average key hold duration (ms)
  stdHold:       number; // variance in hold durations
  meanFlight:    number; // average gap between key releases (ms)
  stdFlight:     number; // variance in flight times
  typingSpeed:   number; // keystrokes per minute
  backspaceRate: number; // backspaces as a fraction of total keystrokes (0–1)
}