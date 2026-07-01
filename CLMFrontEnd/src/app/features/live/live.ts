import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { KeystrokeService } from '../../core/services/keystroke';
import { AiService } from '../../core/services/ai';
import { BaselineService } from '../../core/services/baseline';
import { SessionAnalysisService } from '../../core/services/session-analysis';
import { UserBaseline } from '../../models/user-baseline.model';
import { LoadSample, SessionSummary } from '../../models/load-sample.model';
import { AttentionMeterComponent } from '../../shared/components/attention-meter/attention-meter';
import { LoadChartComponent } from '../../shared/components/load-chart/load-chart';

const TICK_MS = 5_000;

// Number of consecutive high-load windows required before suggesting a break
// on the "sustained high load" path. 4 windows x 5s = 20 seconds.
const CONSECUTIVE_HIGH_REQUIRED = 4;
const HIGH_LOAD_THRESHOLD       = 0.7;

// Don't nag again immediately after a break prompt is dismissed, regardless
// of which detector triggered it.
const SNOOZE_MS = 5 * 60 * 1_000;

// Cap how much load history we keep in memory. At one sample per TICK_MS,
// 720 samples = 1 hour. Long enough for any single work session, small
// enough that this never becomes a real memory concern.
const MAX_HISTORY_SAMPLES = 720;

type BreakReason = 'sustained-high' | 'erratic-decline';

@Component({
  selector: 'app-live',
  standalone: true,
  imports: [CommonModule, RouterLink, AttentionMeterComponent, LoadChartComponent],
  templateUrl: './live.html',
  styleUrl: './live.css'
})
export class LiveComponent implements OnInit, OnDestroy {

  currentLoad      = 0;
  hasBaseline      = false;
  showBreakPrompt  = false;
  breakReason: BreakReason | null = null;

  sessionActive    = false;
  sessionSummary: SessionSummary | null = null;

  private consecutiveHighCount = 0;
  private snoozedUntil         = 0;
  private loopTimer?: ReturnType<typeof setInterval>;

  private sessionStart = 0;
  history: LoadSample[] = [];

  constructor(
    private keystroke:       KeystrokeService,
    private aiService:       AiService,
    private baselineService: BaselineService,
    private sessionAnalysis: SessionAnalysisService
  ) {}

  ngOnInit(): void {
    this.keystroke.init();
    this.hasBaseline = this.baselineService.hasBaseline();

    if (this.hasBaseline) {
      this.startSession();
    }
  }

  ngOnDestroy(): void {
    this.keystroke.stop();
    clearInterval(this.loopTimer);
  }

  private startSession(): void {
    this.sessionActive  = true;
    this.sessionSummary = null;
    this.sessionStart    = Date.now();
    this.history          = [];
    this.consecutiveHighCount = 0;
    this.snoozedUntil    = 0;
    this.showBreakPrompt = false;
    this.breakReason      = null;

    this.loopTimer = setInterval(() => this.onTick(), TICK_MS);
  }

  endSession(): void {
    if (!this.sessionActive) return;

    clearInterval(this.loopTimer);
    this.sessionActive = false;

    this.sessionSummary = this.sessionAnalysis.buildSummary(
      this.history,
      this.sessionStart,
      Date.now(),
      HIGH_LOAD_THRESHOLD
    );
  }

  startNewSession(): void {
    this.sessionSummary = null;
    this.startSession();
  }

  private onTick(): void {
    if (!this.keystroke.hasEnoughData()) {
      this.keystroke.resetWindow();
      // Idle window -- don't let idle time count toward "consecutive high load"
      this.consecutiveHighCount = 0;
      return;
    }

    const features = this.keystroke.getWindowFeatures();
    const baseline: UserBaseline | null = this.baselineService.getBaseline();
    const score    = this.aiService.computeScore(features, baseline);

    this.currentLoad = score.value;
    this.keystroke.resetWindow();

    this.recordSample(score.value, score.stdHoldDeviation, score.stdFlightDeviation);
    this.checkBreakConditions(score.value);
  }

  private recordSample(value: number, stdHoldDeviation: number, stdFlightDeviation: number): void {
    this.history.push({
      timestamp: Date.now(),
      value,
      stdHoldDeviation,
      stdFlightDeviation
    });

    if (this.history.length > MAX_HISTORY_SAMPLES) {
      this.history.shift();
    }
  }

  private checkBreakConditions(loadValue: number): void {
    const snoozeActive = Date.now() < this.snoozedUntil;
    if (snoozeActive || this.showBreakPrompt) {
      // Still track the sustained-high counter even while snoozed, so it
      // doesn't artificially reset and re-fire the instant snooze ends.
      this.consecutiveHighCount = loadValue >= HIGH_LOAD_THRESHOLD ? this.consecutiveHighCount + 1 : 0;
      return;
    }

    // Trigger A -- sustained high load. Kept as-is: useful as a simple
    // "you've been pushing hard for a while" nudge, independent of whether
    // typing is degrading.
    if (loadValue >= HIGH_LOAD_THRESHOLD) {
      this.consecutiveHighCount++;
    } else {
      this.consecutiveHighCount = 0;
    }

    if (this.consecutiveHighCount >= CONSECUTIVE_HIGH_REQUIRED) {
      this.triggerBreakPrompt('sustained-high');
      return;
    }

    // Trigger B -- erratic decline. A peak followed by falling load AND
    // rising typing-variance deviation. This is the closer proxy for
    // "actually struggling" rather than just "load number is high."
    if (this.sessionAnalysis.detectErraticDecline(this.history)) {
      this.triggerBreakPrompt('erratic-decline');
    }
  }

  private triggerBreakPrompt(reason: BreakReason): void {
    this.showBreakPrompt = true;
    this.breakReason      = reason;
  }

  dismissBreakPrompt(): void {
    this.showBreakPrompt      = false;
    this.breakReason          = null;
    this.consecutiveHighCount = 0;
    this.snoozedUntil         = Date.now() + SNOOZE_MS;
  }

  // -- Template helpers --------------------------------------------------------

  get breakPromptTitle(): string {
    return this.breakReason === 'erratic-decline'
      ? 'You seem to be losing focus.'
      : "You've been under sustained high load for a while.";
  }

  get breakPromptBody(): string {
    return this.breakReason === 'erratic-decline'
      ? 'Your typing has gotten less steady after a peak in load -- take a 5 minute break?'
      : 'Consider taking a short break.';
  }

  formatDuration(ms: number): string {
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${seconds}s`;
  }

  formatTime(ts: number | null): string {
    if (ts === null) return '--';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}