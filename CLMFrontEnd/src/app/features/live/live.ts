import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { KeystrokeService } from '../../core/services/keystroke';
import { AiService } from '../../core/services/ai';
import { BaselineService } from '../../core/services/baseline';
import { UserBaseline } from '../../models/user-baseline.model';
import { AttentionMeterComponent } from '../../shared/components/attention-meter/attention-meter';

const TICK_MS = 5_000;

// Number of consecutive high-load windows required before suggesting a break.
// 4 windows × 5s = 20 seconds of sustained high load — long enough to filter
// out a single noisy spike, short enough to still feel responsive.
const CONSECUTIVE_HIGH_REQUIRED = 4;
const HIGH_LOAD_THRESHOLD       = 0.7;

// Don't nag again immediately after a break suggestion is dismissed.
const SNOOZE_MS = 5 * 60 * 1_000;

@Component({
  selector: 'app-live',
  standalone: true,
  imports: [CommonModule, RouterLink, AttentionMeterComponent],
  templateUrl: './live.html',
  styleUrl: './live.css'
})
export class LiveComponent implements OnInit, OnDestroy {

  currentLoad      = 0;
  hasBaseline      = false;
  showBreakPrompt  = false;

  private consecutiveHighCount = 0;
  private snoozedUntil         = 0;
  private loopTimer?: ReturnType<typeof setInterval>;

  constructor(
    private keystroke:       KeystrokeService,
    private aiService:       AiService,
    private baselineService: BaselineService
  ) {}

  ngOnInit(): void {
    this.keystroke.init();
    this.hasBaseline = this.baselineService.hasBaseline();

    if (this.hasBaseline) {
      this.loopTimer = setInterval(() => this.onTick(), TICK_MS);
    }
  }

  ngOnDestroy(): void {
    this.keystroke.stop();
    clearInterval(this.loopTimer);
  }

  private onTick(): void {
    if (!this.keystroke.hasEnoughData()) {
      this.keystroke.resetWindow();
      // Idle window — don't let idle time count toward "consecutive high load"
      this.consecutiveHighCount = 0;
      return;
    }

    const features = this.keystroke.getWindowFeatures();
    const baseline: UserBaseline | null = this.baselineService.getBaseline();
    const score    = this.aiService.computeScore(features, baseline);

    this.currentLoad = score.value;
    this.keystroke.resetWindow();

    this.checkBreakCondition(score.value);
  }

  private checkBreakCondition(loadValue: number): void {
    if (loadValue >= HIGH_LOAD_THRESHOLD) {
      this.consecutiveHighCount++;
    } else {
      this.consecutiveHighCount = 0;
    }

    const snoozeActive = Date.now() < this.snoozedUntil;

    if (
      this.consecutiveHighCount >= CONSECUTIVE_HIGH_REQUIRED &&
      !snoozeActive &&
      !this.showBreakPrompt
    ) {
      this.showBreakPrompt = true;
    }
  }

  dismissBreakPrompt(): void {
    this.showBreakPrompt      = false;
    this.consecutiveHighCount = 0;
    this.snoozedUntil         = Date.now() + SNOOZE_MS;
  }
}