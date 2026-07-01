import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface TlxRating {
  mentalDemand: number;
  timePressure: number;
  performance:  number;
  effort:       number;
  frustration:  number;
  normalized:   number;
  timestamp:    number;
}

interface TlxDimension {
  key:         string;
  label:       string;
  description: string;
  lowLabel:    string;
  highLabel:   string;
  value:       number;
}

@Component({
  selector: 'app-tlx-prompt',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tlx-prompt.html',
  styleUrl: './tlx-prompt.css'
})
export class TlxPromptComponent {

  @Output() rated = new EventEmitter<TlxRating>();
  @Output() skip  = new EventEmitter<void>();

  dimensions: TlxDimension[] = [
    {
      key: 'mentalDemand', label: 'Mental demand',
      description: 'How much thinking, deciding, calculating, or remembering were you doing?',
      lowLabel: 'Very low', highLabel: 'Very high', value: 5
    },
    {
      key: 'timePressure', label: 'Time pressure',
      description: 'How rushed or hurried was the pace of what you were working on?',
      lowLabel: 'Very low', highLabel: 'Very high', value: 5
    },
    {
      key: 'performance', label: 'Performance',
      description: 'How successful do you feel you were? How satisfied with what you accomplished?',
      lowLabel: 'Perfect', highLabel: 'Failure', value: 5
    },
    {
      key: 'effort', label: 'Effort',
      description: 'How hard did you have to work (mentally) to accomplish your performance?',
      lowLabel: 'Very low', highLabel: 'Very high', value: 5
    },
    {
      key: 'frustration', label: 'Frustration',
      description: 'How irritated, stressed, or annoyed were you during the task?',
      lowLabel: 'Very low', highLabel: 'Very high', value: 5
    }
  ];

  averageScore    = 5;
  normalizedScore = 0.5;
  progressPercent = 50;
  interpretation  = 'Moderate cognitive load.';

  get fillClass(): string {
    if (this.averageScore <= 4) return 'low';
    if (this.averageScore <= 6) return 'med';
    return 'high';
  }

  recalculate(): void {
    const sum = this.dimensions.reduce((t, d) => t + d.value, 0);
    this.averageScore    = sum / this.dimensions.length;
    this.normalizedScore = (this.averageScore - 1) / 8;
    this.progressPercent = Math.round(this.normalizedScore * 100);

    if (this.averageScore <= 4)      this.interpretation = 'Low load — good focus conditions.';
    else if (this.averageScore <= 6) this.interpretation = 'Moderate load — demanding but manageable.';
    else                              this.interpretation = 'High load — consider a break after this.';
  }

  submit(): void {
    this.rated.emit({
      mentalDemand: this.dimensions[0].value,
      timePressure:  this.dimensions[1].value,
      performance:   this.dimensions[2].value,
      effort:        this.dimensions[3].value,
      frustration:   this.dimensions[4].value,
      normalized:    parseFloat(this.normalizedScore.toFixed(4)),
      timestamp:     Date.now()
    });
  }
}