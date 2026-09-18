import { TestBed } from '@angular/core/testing';
import { MediaMatcher } from '@angular/cdk/layout';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        {
          provide: MediaMatcher,
          useValue: {
            matchMedia: () => ({
              matches: false,
              addEventListener: () => undefined,
              removeEventListener: () => undefined,
            }),
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
