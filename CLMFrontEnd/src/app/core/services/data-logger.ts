import { Injectable } from '@angular/core';
import { CognitiveLogRow } from '../../models/cognitive-log-row.model';
import { CognitiveFeatures } from '../../models/cognitive-features.model';
import { Score } from './ai';
import { TlxRating } from '../../shared/components/tlx-prompt/tlx-prompt';

const STORAGE_KEY = 'clm_rows';

// CSV columns — must stay in sync with the training script
const CSV_HEADER = [
  'userId',
  'meanHold', 'stdHold', 'meanFlight', 'stdFlight',
  'typingSpeed', 'backspaceRate',
  'speedDrop', 'holdIncrease', 'flightIncrease',
  'stdHoldDeviation', 'stdFlightDeviation',
  'label'
].join(',');

@Injectable({ providedIn: 'root' })
export class DataLoggerService {

  private rows:   CognitiveLogRow[] = [];
  private userId: string = '';

  constructor() {
    this.userId = localStorage.getItem('clm_user_id') ?? '';
    this.loadFromStorage();
  }

  setUserId(id: string): void {
    this.userId = id.trim();
    localStorage.setItem('clm_user_id', this.userId);
  }

  getUserId(): string {
    return this.userId;
  }

  // Called every 5 seconds by home.ts onTick()
  // score comes from AiService and already contains all deviation fields
  log(features: CognitiveFeatures, score: Score): void {
    const row: CognitiveLogRow = {
      userId:              this.userId,
      timestamp:           Date.now(),
      meanHold:            features.meanHold,
      stdHold:             features.stdHold,
      meanFlight:          features.meanFlight,
      stdFlight:           features.stdFlight,
      typingSpeed:         features.typingSpeed,
      backspaceRate:       features.backspaceRate,
      speedDrop:           score.speedDrop,
      holdIncrease:        score.holdIncrease,
      flightIncrease:      score.flightIncrease,
      stdHoldDeviation:    score.stdHoldDeviation,
      stdFlightDeviation:  score.stdFlightDeviation,
      heuristicScore:      score.value,
      tlxLabel:            null
    };

    this.rows.push(row);
    this.saveToStorage(); // persist immediately — survive browser refresh
  }

  // Labels every row inside the task window with the TLX score
  applyTlxLabel(rating: TlxRating, windowStart: number): void {
    const rowsInWindow = this.rows.filter(
      r => r.timestamp >= windowStart && r.timestamp <= rating.timestamp
    );

    rowsInWindow.forEach(r => r.tlxLabel = rating.normalized);
    this.saveToStorage();

    console.log(
      `[DataLogger] TLX ${rating.normalized.toFixed(3)} → ${rowsInWindow.length} rows. ` +
      `Total labeled: ${this.getLabeledRowCount()}`
    );
  }

  getLabeledRowCount(): number {
    return this.rows.filter(r => r.tlxLabel !== null).length;
  }

  /** Rows logged since taskStart — used to gate the inactivity TLX prompt */
  getCurrentTaskRowCount(taskStart: number = 0): number {
    return this.rows.filter(r => r.timestamp >= taskStart).length;
  }

  getTotalRowCount(): number {
    return this.rows.length;
  }

  // Returns a summary of label distribution so you can check spread before training
  getLabelDistribution(): { low: number; medium: number; high: number } {
    const labeled = this.rows.filter(r => r.tlxLabel !== null);
    return {
      low:    labeled.filter(r => r.tlxLabel! < 0.33).length,
      medium: labeled.filter(r => r.tlxLabel! >= 0.33 && r.tlxLabel! < 0.66).length,
      high:   labeled.filter(r => r.tlxLabel! >= 0.66).length
    };
  }

  // Downloads only labeled rows as CSV
  downloadLabeledCSV(): void {
    const labeled = this.rows.filter(r => r.tlxLabel !== null);

    if (labeled.length === 0) {
      alert('No labeled data yet. Complete at least one task first.');
      return;
    }

    const csvRows = labeled.map(r => [
      r.userId,
      r.meanHold.toFixed(2),
      r.stdHold.toFixed(2),
      r.meanFlight.toFixed(2),
      r.stdFlight.toFixed(2),
      r.typingSpeed.toFixed(1),
      r.backspaceRate.toFixed(4),
      r.speedDrop.toFixed(4),
      r.holdIncrease.toFixed(4),
      r.flightIncrease.toFixed(4),
      r.stdHoldDeviation.toFixed(4),
      r.stdFlightDeviation.toFixed(4),
      r.tlxLabel!.toFixed(4)
    ].join(','));

    const csv  = [CSV_HEADER, ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = window.URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `clm_session_${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    console.log(`[DataLogger] Exported ${labeled.length} labeled rows.`);
  }

  // Wipes everything — both in-memory and in localStorage
  clear(): void {
    this.rows = [];
    localStorage.removeItem(STORAGE_KEY);
    console.log('[DataLogger] Cleared.');
  }

  // --- Storage ---

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.rows));
    } catch (e) {
      // localStorage has a ~5MB limit — warn if it fills up
      console.warn('[DataLogger] localStorage write failed — may be full:', e);
    }
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.rows = JSON.parse(raw);
        console.log(`[DataLogger] Restored ${this.rows.length} rows from storage.`);
      }
    } catch (e) {
      console.warn('[DataLogger] Failed to restore rows from storage:', e);
      this.rows = [];
    }
  }
}