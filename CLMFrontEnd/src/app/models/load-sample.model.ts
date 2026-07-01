// One timestamped load reading captured during a Live session.
// Kept minimal — just enough to reconstruct a session summary afterward.
// This is NOT persisted to localStorage or sent anywhere; it lives only
// for the duration of one Live page visit (cleared on ngOnDestroy).

export interface LoadSample {
  timestamp:          number; // Date.now() at the time of this reading
  value:               number; // cognitive load score, 0–1
  stdHoldDeviation:    number; // from Score — how far hold-time variance is from baseline
  stdFlightDeviation:  number; // from Score — how far flight-time variance is from baseline
}

// Computed once, when the user ends a session — never partially built up.
export interface SessionSummary {
  startedAt:        number;
  endedAt:          number;
  durationMs:        number;

  peakLoad:          number;
  peakAt:            number | null;       // timestamp of the peak, null if no samples

  // Total time spent at/above HIGH_LOAD_THRESHOLD, across however many
  // separate high-load stretches occurred (not just one continuous block).
  totalHighLoadMs:   number;

  // Longest single continuous stretch at/above HIGH_LOAD_THRESHOLD.
  // This is the closer proxy for "time in flow" than the total, since
  // flow is about sustained continuity, not aggregate minutes.
  longestHighLoadStreakMs: number;

  // Timestamp where load most recently crossed from high to not-high.
  // null if load never dropped after going high (e.g. session ended while still high).
  lastDropAt:        number | null;

  sampleCount:       number;
}