import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

import { KeystrokeService } from '@core/services/keystroke';
import { AiService } from '@core/services/ai';
import { DataLoggerService } from '@core/services/data-logger';
import { BaselineService } from '@core/services/baseline';
import { CognitiveFeatures } from '../../../models/cognitive-features.model';
import { UserBaseline } from '../../../models/user-baseline.model';

import { AttentionMeterComponent } from '@shared/components/attention-meter/attention-meter';
import { TlxPromptComponent, TlxRating } from '@shared/components/tlx-prompt/tlx-prompt';
import { CalibrationComponent } from '@shared/components/calibration/calibration';

@Component({
  selector: 'app-home',
  templateUrl: './home.html',
  styleUrl: './home.css',
  standalone: true,
  imports: [CommonModule, AttentionMeterComponent, TlxPromptComponent, CalibrationComponent]
})
export class HomeComponent implements OnInit, OnDestroy {

  currentLoad   = 0;
  showTlxPrompt = false;
  taskActive    = false;
  baseline: UserBaseline | null = null;
  view: 'calibrate' | 'dashboard' = 'dashboard';

  currentFeatures: CognitiveFeatures | null = null;

  private taskStart     = 0;
  private loopTimer?:     ReturnType<typeof setInterval>;
  private fallbackTimer?: ReturnType<typeof setInterval>;

  private readonly LOG_INTERVAL_MS      = 5_000;
  private readonly FALLBACK_INTERVAL_MS = 20 * 60 * 1_000;

  get labeledCount():     number { return this.dataLogger.getLabeledRowCount(); }
  get totalCount():       number { return this.dataLogger.getTotalRowCount(); }
  get labelDistribution() { return this.dataLogger.getLabelDistribution(); }

  constructor(
    public  keystroke:       KeystrokeService,
    private aiService:       AiService,
    public  dataLogger:      DataLoggerService,
    private baselineService: BaselineService
  ) {}

  ngOnInit(): void {
    this.keystroke.init();
    this.baseline = this.baselineService.getBaseline();

    if (!this.baseline) {
      this.view = 'calibrate';
      return;
    }

    this.startMonitoring();
  }

  onCalibrationComplete(baseline: UserBaseline): void {
    this.baseline = baseline;
    this.view     = 'dashboard';
    this.startMonitoring();
  }

  private startMonitoring(): void {
    this.loopTimer = setInterval(() => this.onTick(), this.LOG_INTERVAL_MS);

    this.fallbackTimer = setInterval(() => {
      if (this.taskActive) this.showTlxPrompt = true;
    }, this.FALLBACK_INTERVAL_MS);
  }

  private onTick(): void {
    if (!this.keystroke.hasEnoughData()) {
      this.keystroke.resetWindow();
      return;
    }

    const raw = this.keystroke.getWindowFeatures();

    const features: CognitiveFeatures = {
      meanHold:      raw.meanHold,
      stdHold:       raw.stdHold,
      meanFlight:    raw.meanFlight,
      stdFlight:     raw.stdFlight,
      typingSpeed:   raw.typingSpeed,
      backspaceRate: raw.backspaceRate
    };

    const score      = this.aiService.computeScore(features, this.baseline);
    this.currentLoad = score.value;
    this.currentFeatures = features;

    // Pass the full score object — logger extracts deviation fields from it
    this.dataLogger.log(features, score);
    this.keystroke.resetWindow();
  }

  startTask(): void {
    this.taskStart  = Date.now();
    this.taskActive = true;
  }

  endTask(): void {
    if (!this.taskActive) return;
    this.showTlxPrompt = true;
  }

  onTlxRated(rating: TlxRating): void {
    this.dataLogger.applyTlxLabel(rating, this.taskStart);
    this.showTlxPrompt = false;
    this.taskActive    = false;
    this.taskStart     = 0;
  }

  onTlxSkipped(): void {
    this.showTlxPrompt = false;
    this.taskActive    = false;
    this.taskStart     = 0;
  }

  recalibrate(): void {
    this.baselineService.clearBaseline();
    this.baseline = null;
    this.view     = 'calibrate';
    clearInterval(this.loopTimer);
    clearInterval(this.fallbackTimer);
  }

  ngOnDestroy(): void {
    this.keystroke.stop();
    clearInterval(this.loopTimer);
    clearInterval(this.fallbackTimer);
  }
}