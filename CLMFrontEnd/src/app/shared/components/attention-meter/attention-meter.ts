import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-attention-meter',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './attention-meter.html',
  styleUrl: './attention-meter.css'
})
export class AttentionMeterComponent implements OnChanges {
  @Input() cognitiveLoad = 0;

  // SVG arc params
  readonly R   = 70;   // radius
  readonly CX  = 90;   // center x
  readonly CY  = 90;   // center y

  // The arc sweeps from 210deg to 330deg (240deg total) — bottom-left to bottom-right
  // We express arc endpoints in radians for Math.cos/sin
  readonly START_DEG = 210;
  readonly SWEEP_DEG = 240;

  arcPath      = '';
  fillPath     = '';
  arcColor     = '#f5c518';

  get label(): string {
    const v = this.cognitiveLoad;
    if (v < 0.33) return 'Low';
    if (v < 0.66) return 'Moderate';
    return 'High';
  }

  get labelColor(): string {
    const v = this.cognitiveLoad;
    if (v < 0.33) return '#4caf7d';
    if (v < 0.66) return '#f5c518';
    return '#e05252';
  }

  ngOnChanges(): void {
    this.arcPath  = this.describeArc(0, 1);
    this.fillPath = this.describeArc(0, Math.max(0, Math.min(1, this.cognitiveLoad)));
    this.arcColor = this.labelColor;
  }

  private polarToCart(angleDeg: number): { x: number; y: number } {
    const rad = (angleDeg - 90) * (Math.PI / 180);
    return {
      x: this.CX + this.R * Math.cos(rad),
      y: this.CY + this.R * Math.sin(rad)
    };
  }

  private describeArc(fromFrac: number, toFrac: number): string {
    const startAngle = this.START_DEG + fromFrac * this.SWEEP_DEG;
    const endAngle   = this.START_DEG + toFrac   * this.SWEEP_DEG;
    const start = this.polarToCart(startAngle);
    const end   = this.polarToCart(endAngle);
    const large = (endAngle - startAngle) > 180 ? 1 : 0;
    if (Math.abs(toFrac - fromFrac) < 0.001) return '';
    return `M ${start.x} ${start.y} A ${this.R} ${this.R} 0 ${large} 1 ${end.x} ${end.y}`;
  }
}