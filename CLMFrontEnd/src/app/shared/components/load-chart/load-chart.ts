import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadSample } from '../../../models/load-sample.model';

const W = 560;
const H = 100;
const PAD = { t: 8, r: 8, b: 24, l: 32 };
const INNER_W = W - PAD.l - PAD.r;
const INNER_H = H - PAD.t - PAD.b;
const HIGH_THRESHOLD = 0.7;

@Component({
  selector: 'app-load-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './load-chart.html',
  styleUrl: './load-chart.css'
})
export class LoadChartComponent implements OnChanges {
  @Input() samples: LoadSample[] = [];
  @Input() showThreshold = true;

  linePath       = '';
  areaPath       = '';
  thresholdY     = 0;
  yLabels: { y: number; label: string }[] = [];
  xLabels: { x: number; label: string }[] = [];

  readonly W = W;
  readonly H = H;
  readonly PAD = PAD;

  ngOnChanges(): void {
    if (this.samples.length < 2) {
      this.linePath = '';
      this.areaPath = '';
      return;
    }

    const minT = this.samples[0].timestamp;
    const maxT = this.samples[this.samples.length - 1].timestamp;
    const tSpan = Math.max(maxT - minT, 1);

    const pts = this.samples.map(s => ({
      x: PAD.l + ((s.timestamp - minT) / tSpan) * INNER_W,
      y: PAD.t + (1 - s.value) * INNER_H
    }));

    this.linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    this.areaPath = this.linePath
      + ` L ${pts[pts.length - 1].x.toFixed(1)} ${(PAD.t + INNER_H).toFixed(1)}`
      + ` L ${pts[0].x.toFixed(1)} ${(PAD.t + INNER_H).toFixed(1)} Z`;

    this.thresholdY = PAD.t + (1 - HIGH_THRESHOLD) * INNER_H;

    this.yLabels = [
      { y: PAD.t + INNER_H,           label: '0'    },
      { y: PAD.t + INNER_H * 0.5,     label: '50'   },
      { y: PAD.t,                      label: '100'  },
    ];

    // Show up to 4 time labels
    const count = Math.min(4, this.samples.length);
    this.xLabels = Array.from({ length: count }, (_, i) => {
      const idx = Math.round((i / (count - 1)) * (this.samples.length - 1));
      const s   = this.samples[idx];
      const x   = PAD.l + ((s.timestamp - minT) / tSpan) * INNER_W;
      const date = new Date(s.timestamp);
      const label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return { x, label };
    });
  }
}