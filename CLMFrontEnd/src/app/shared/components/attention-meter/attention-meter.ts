import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-attention-meter',
  standalone: true,
  imports: [CommonModule],
  template: `<div>Load: {{ cognitiveLoad | number:'1.0-2' }}</div>`
})
export class AttentionMeterComponent {
  @Input() cognitiveLoad = 0;
}






