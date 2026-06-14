import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// This is the shape of the data we emit back to the parent (HomeComponent)
// when the user completes the form
export interface TlxRating {
  mentalDemand: number;  // raw 1-9 answer
  timePressure: number;
  performance: number;
  effort: number;
  frustration: number;
  normalized: number;    // 0-1 average - this becomes the training label
  timestamp: number;     // when the user submitted it
}

// A single question/dimension in the NASA-TLX survey
interface TlxDimension {
  key: string;
  label: string;
  description: string;
  lowLabel: string;
  highLabel: string;
  value: number; // the slider value, starts at 5
}

@Component({
  selector: 'app-tlx-prompt',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Full-screen overlay so nothing behind it is clickable -->
    <div class="overlay">
      <div class="card">

        <div class="card-header">
          <h2 class="card-title">Quick check-in</h2>
          <p class="card-subtitle">
            Rate the last 10 minutes on each scale. Takes about 30 seconds.
          </p>
        </div>

        <!-- Loop over the 5 dimensions and render a slider for each -->
        @for (dim of dimensions; track dim.key) {
          <div class="dimension">
            <div class="dimension-header">
              <span class="dimension-label">{{ dim.label }}</span>
              <span class="dimension-value">{{ dim.value }}<span class="dimension-max"> / 9</span></span>
            </div>
            <p class="dimension-desc">{{ dim.description }}</p>
            <input
              type="range"
              min="1"
              max="9"
              step="1"
              [(ngModel)]="dim.value"
              (ngModelChange)="recalculate()"
              class="slider"
            />
            <div class="scale-labels">
              <span>{{ dim.lowLabel }}</span>
              <span>{{ dim.highLabel }}</span>
            </div>
          </div>
        }

        <!-- Summary section showing the computed label -->
        <div class="summary">
          <div class="summary-row">
            <span class="summary-label">Overall cognitive load</span>
            <span class="summary-score">{{ averageScore.toFixed(1) }} / 9</span>
          </div>
          <div class="progress-track">
            <div
              class="progress-fill"
              [style.width.%]="progressPercent"
              [class.low]="averageScore <= 4"
              [class.medium]="averageScore > 4 && averageScore <= 6"
              [class.high]="averageScore > 6"
            ></div>
          </div>
          <p class="summary-interp">{{ interpretation }}</p>
          <p class="summary-note">
            This value ({{ normalizedScore.toFixed(3) }}) will be saved as the
            training label for the sensor data from this session window.
          </p>
        </div>

        <div class="actions">
          <button class="btn-primary" (click)="submit()">Save rating</button>
          <button class="btn-secondary" (click)="skip.emit()">Skip this time</button>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 16px;
    }

    .card {
      background: #fff;
      border-radius: 12px;
      padding: 24px;
      width: 100%;
      max-width: 520px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    }

    .card-header {
      margin-bottom: 20px;
    }

    .card-title {
      font-size: 18px;
      font-weight: 600;
      margin: 0 0 6px;
      color: #1a1a1a;
    }

    .card-subtitle {
      font-size: 13px;
      color: #666;
      margin: 0;
    }

    .dimension {
      background: #f8f8f7;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 10px;
    }

    .dimension-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
    }

    .dimension-label {
      font-size: 14px;
      font-weight: 500;
      color: #1a1a1a;
    }

    .dimension-value {
      font-size: 16px;
      font-weight: 600;
      color: #1a1a1a;
    }

    .dimension-max {
      font-size: 12px;
      font-weight: 400;
      color: #999;
    }

    .dimension-desc {
      font-size: 12px;
      color: #666;
      margin: 0 0 10px;
      line-height: 1.5;
    }

    .slider {
      width: 100%;
      accent-color: #3b82f6;
    }

    .scale-labels {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #aaa;
      margin-top: 4px;
    }

    .summary {
      background: #f0f4ff;
      border-radius: 8px;
      padding: 14px;
      margin: 16px 0;
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 10px;
    }

    .summary-label {
      font-size: 14px;
      font-weight: 500;
      color: #1a1a1a;
    }

    .summary-score {
      font-size: 20px;
      font-weight: 600;
      color: #1a1a1a;
    }

    .progress-track {
      background: #dde3f0;
      border-radius: 6px;
      height: 10px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .progress-fill {
      height: 100%;
      border-radius: 6px;
      transition: width 0.3s ease, background-color 0.3s ease;
    }

    .progress-fill.low    { background: #22c55e; }
    .progress-fill.medium { background: #f59e0b; }
    .progress-fill.high   { background: #ef4444; }

    .summary-interp {
      font-size: 13px;
      color: #555;
      margin: 0 0 6px;
    }

    .summary-note {
      font-size: 11px;
      color: #888;
      margin: 0;
      font-family: monospace;
    }

    .actions {
      display: flex;
      gap: 10px;
    }

    .btn-primary {
      flex: 1;
      background: #3b82f6;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 12px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }

    .btn-primary:hover { background: #2563eb; }

    .btn-secondary {
      flex: 1;
      background: transparent;
      color: #666;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 12px;
      font-size: 14px;
      cursor: pointer;
    }

    .btn-secondary:hover { background: #f5f5f5; }
  `]
})
export class TlxPromptComponent {

  // EventEmitters let this component "talk back" to the parent component.
  // When the user submits, we fire 'rated' with the TlxRating data.
  // When they skip, we fire 'skip' with nothing.
  @Output() rated = new EventEmitter<TlxRating>();
  @Output() skip  = new EventEmitter<void>();

  // The five NASA-TLX dimensions. We use 5 instead of the original 6
  // because Physical Demand is irrelevant for desk-based cognitive work.
  dimensions: TlxDimension[] = [
    {
      key: 'mentalDemand',
      label: 'Mental demand',
      description: 'How much thinking, deciding, calculating, or remembering were you doing?',
      lowLabel: 'Very low',
      highLabel: 'Very high',
      value: 5
    },
    {
      key: 'timePressure',
      label: 'Time pressure',
      description: 'How rushed or hurried was the pace of what you were working on?',
      lowLabel: 'Very low',
      highLabel: 'Very high',
      value: 5
    },
    {
      key: 'performance',
      label: 'Performance',
      description: 'How successful do you feel you were? How satisfied with what you accomplished?',
      lowLabel: 'Perfect',
      highLabel: 'Failure',
      value: 5
    },
    {
      key: 'effort',
      label: 'Effort',
      description: 'How hard did you have to work (mentally) to accomplish your level of performance?',
      lowLabel: 'Very low',
      highLabel: 'Very high',
      value: 5
    },
    {
      key: 'frustration',
      label: 'Frustration',
      description: 'How irritated, stressed, or annoyed were you during the task?',
      lowLabel: 'Very low',
      highLabel: 'Very high',
      value: 5
    }
  ];

  // These are computed from the sliders and shown in the summary
  averageScore    = 5;
  normalizedScore = 0.5; // This is the actual training label (0-1)
  progressPercent = 50;
  interpretation  = 'Moderate cognitive load.';

  // Called every time any slider moves
  recalculate(): void {
    const sum = this.dimensions.reduce((total, dim) => total + dim.value, 0);
    this.averageScore = sum / this.dimensions.length;

    // Convert 1-9 range to 0-1 range for the model
    // 1 → 0.000, 5 → 0.500, 9 → 1.000
    this.normalizedScore = (this.averageScore - 1) / 8;
    this.progressPercent = Math.round(this.normalizedScore * 100);

    if (this.averageScore <= 4) {
      this.interpretation = 'Low cognitive load — good focus conditions.';
    } else if (this.averageScore <= 6) {
      this.interpretation = 'Moderate cognitive load — task is demanding but manageable.';
    } else {
      this.interpretation = 'High cognitive load — user may be struggling or overwhelmed.';
    }
  }

  submit(): void {
    // Build the rating object and emit it to HomeComponent
    const rating: TlxRating = {
      mentalDemand: this.dimensions[0].value,
      timePressure:  this.dimensions[1].value,
      performance:   this.dimensions[2].value,
      effort:        this.dimensions[3].value,
      frustration:   this.dimensions[4].value,
      normalized:    parseFloat(this.normalizedScore.toFixed(4)),
      timestamp:     Date.now()
    };

    this.rated.emit(rating);
  }
}