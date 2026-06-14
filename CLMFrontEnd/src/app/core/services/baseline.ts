import { Injectable } from '@angular/core';
import { KeystrokeService } from './keystroke';
import { UserBaseline } from '../../models/user-baseline.model';

const STORAGE_KEY  = 'clm_baseline';
const SAMPLE_COUNT = 6; // 6 × 5 seconds = 30 seconds of active typing

@Injectable({ providedIn: 'root' })
export class BaselineService {

  samplesCollected = 0;
  isCalibrating    = false;

  private samples: {
    meanHold: number; stdHold: number;
    meanFlight: number; stdFlight: number;
    typingSpeed: number;
  }[] = [];

  private sampleTimer?: ReturnType<typeof setInterval>;

  constructor(private keystroke: KeystrokeService) {}

  getBaseline(): UserBaseline | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  hasBaseline(): boolean {
    return this.getBaseline() !== null;
  }

  startCalibration(onComplete: (baseline: UserBaseline) => void): void {
    this.samples          = [];
    this.samplesCollected = 0;
    this.isCalibrating    = true;
    this.keystroke.resetWindow();

    this.sampleTimer = setInterval(() => {
      if (!this.keystroke.hasEnoughData()) {
        this.keystroke.resetWindow();
        return;
      }

      const f = this.keystroke.getWindowFeatures();

      this.samples.push({
        meanHold:    f.meanHold,
        stdHold:     f.stdHold,
        meanFlight:  f.meanFlight,
        stdFlight:   f.stdFlight,
        typingSpeed: f.typingSpeed
      });

      this.samplesCollected = this.samples.length;
      this.keystroke.resetWindow();

      if (this.samples.length >= SAMPLE_COUNT) {
        clearInterval(this.sampleTimer);
        this.isCalibrating = false;

        const baseline = this.computeBaseline();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(baseline));
        console.log('[Baseline] Saved:', baseline);
        onComplete(baseline);
      }
    }, 5_000);
  }

  cancelCalibration(): void {
    clearInterval(this.sampleTimer);
    this.isCalibrating    = false;
    this.samplesCollected = 0;
    this.samples          = [];
    this.keystroke.resetWindow();
  }

  clearBaseline(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  private computeBaseline(): UserBaseline {
    const n = this.samples.length;
    return {
      meanHold:    this.samples.reduce((s, r) => s + r.meanHold,    0) / n,
      stdHold:     this.samples.reduce((s, r) => s + r.stdHold,     0) / n,
      meanFlight:  this.samples.reduce((s, r) => s + r.meanFlight,  0) / n,
      stdFlight:   this.samples.reduce((s, r) => s + r.stdFlight,   0) / n,
      typingSpeed: this.samples.reduce((s, r) => s + r.typingSpeed, 0) / n,
      capturedAt:  Date.now()
    };
  }
}