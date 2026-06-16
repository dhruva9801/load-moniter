// One row in your training dataset.
// Each row = one 5-second window of keystroke data + a NASA-TLX label.
// Only rows where tlxLabel is not null appear in the exported CSV.

export interface CognitiveLogRow {
  userId:         string;       // set once at session start, stamped on every row
  timestamp:      number;       // when this row was captured (ms since epoch)

  // Raw keystroke features
  meanHold:       number;
  stdHold:        number;
  meanFlight:     number;
  stdFlight:      number;
  typingSpeed:    number;
  backspaceRate:  number;

  // Deviation features — computed relative to the user's personal baseline.
  // These are what the model actually trains on.
  speedDrop:          number;
  holdIncrease:       number;
  flightIncrease:     number;
  stdHoldDeviation:   number;
  stdFlightDeviation: number;

  heuristicScore: number;       // score from ai.ts at capture time (for debugging)
  tlxLabel:       number | null; // NASA-TLX normalized to 0–1. null until rated.
}