import { TestBed } from '@angular/core/testing';

import { SessionAnalysis } from './session-analysis';

describe('SessionAnalysis', () => {
  let service: SessionAnalysis;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SessionAnalysis);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
