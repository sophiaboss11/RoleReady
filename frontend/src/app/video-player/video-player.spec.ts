import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { VideoPlayer } from './video-player';
import { OrganizationFacade } from '../services/organization.facade';
import { TrainingPlayerFacade } from '../services/training-player.facade';

describe('VideoPlayer', () => {
  let component: VideoPlayer;
  let fixture: ComponentFixture<VideoPlayer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VideoPlayer],
      providers: [
        provideRouter([]),
        {
          provide: TrainingPlayerFacade,
          useValue: {
            trainingLibrary: signal([]),
            isLoading: signal(false),
            errorMessage: signal(null),
          },
        },
        {
          provide: OrganizationFacade,
          useValue: {
            activeOrgSlug: signal('demo-org'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VideoPlayer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
