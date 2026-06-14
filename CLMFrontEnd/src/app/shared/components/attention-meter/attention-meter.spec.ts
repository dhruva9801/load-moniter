import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AttentionMeter } from './attention-meter';

describe('AttentionMeter', () => {
  let component: AttentionMeter;
  let fixture: ComponentFixture<AttentionMeter>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AttentionMeter]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AttentionMeter);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
