import { TestBed } from '@angular/core/testing';

import { Keystroke } from './keystroke';

describe('Keystroke', () => {
  let service: Keystroke;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Keystroke);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
