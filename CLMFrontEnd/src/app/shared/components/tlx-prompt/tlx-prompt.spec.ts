import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TlxPrompt } from './tlx-prompt';

describe('TlxPrompt', () => {
  let component: TlxPrompt;
  let fixture: ComponentFixture<TlxPrompt>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TlxPrompt]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TlxPrompt);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
