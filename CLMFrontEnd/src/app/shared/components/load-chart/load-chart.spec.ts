import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoadChart } from './load-chart';

describe('LoadChart', () => {
  let component: LoadChart;
  let fixture: ComponentFixture<LoadChart>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoadChart]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LoadChart);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
