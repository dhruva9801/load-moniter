import { TestBed } from '@angular/core/testing';

import { Baseline } from './baseline';

describe('Baseline', () => {
  let service: Baseline;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Baseline);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
