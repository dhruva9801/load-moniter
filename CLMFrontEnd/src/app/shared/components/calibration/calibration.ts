import { Component, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaselineService } from '@core/services/baseline';
import { KeystrokeService } from '@core/services/keystroke';
import { UserBaseline } from '../../../models/user-baseline.model';

// Total valid windows needed — imported so the template can show progress
const SAMPLE_COUNT = 6;

@Component({
  selector: 'app-calibration',
  templateUrl: './calibration.html',
  styleUrl: './calibration.css',
  standalone: true,
  imports: [CommonModule]
})
export class CalibrationComponent implements OnDestroy {

  // Emitted when calibration completes — home.ts listens and switches to dashboard
  @Output() calibrationComplete = new EventEmitter<UserBaseline>();

  readonly totalSamples = SAMPLE_COUNT;
  phase: 'idle' | 'running' | 'done' = 'idle';

  get samplesCollected(): number {
    return this.baselineService.samplesCollected;
  }

  get progressPercent(): number {
    return Math.round((this.samplesCollected / this.totalSamples) * 100);
  }

  constructor(
    public  baselineService: BaselineService,
    private keystroke: KeystrokeService
  ) {}

  start(): void {
    this.phase = 'running';

    this.baselineService.startCalibration((baseline) => {
      this.phase = 'done';
      this.calibrationComplete.emit(baseline);
    });
  }

  cancel(): void {
    this.baselineService.cancelCalibration();
    this.phase = 'idle';
  }

  ngOnDestroy(): void {
    if (this.baselineService.isCalibrating) {
      this.baselineService.cancelCalibration();
    }
  }
}
