import { TestBed } from '@angular/core/testing';

import { DataLogger } from './data-logger';

describe('DataLogger', () => {
  let service: DataLogger;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DataLogger);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
