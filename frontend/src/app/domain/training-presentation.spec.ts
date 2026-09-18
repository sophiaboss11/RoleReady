import {
  isViewerAssignedToTraining,
  resolveViewerTrainingProgress,
  toTrainingCardViewModel,
} from './training-presentation';
import type { TrainingSummary } from './training.types';

function buildTrainingSummary(overrides: Partial<TrainingSummary> = {}): TrainingSummary {
  return {
    id: 'training-1',
    projectId: 'project-1',
    title: 'Architecture Basics',
    description: 'Foundational architecture training.',
    status: 'published',
    createdBy: 'user-1',
    coverImageUrl: 'https://assets.example.com/training-covers/training-1.png',
    coverImageStatus: 'ready',
    coverImageError: null,
    coverImageGeneratedAt: '2026-04-07T00:01:00.000Z',
    createdAt: '2026-04-07T00:00:00.000Z',
    updatedAt: '2026-04-07T00:00:00.000Z',
    moduleCount: 4,
    assignmentCount: 3,
    averageProgressPct: 84,
    viewerAssignmentId: 'assignment-1',
    viewerAssignmentStatus: 'in_progress',
    viewerProgressPct: 50,
    ...overrides,
  };
}

describe('training presentation progress', () => {
  it('uses viewer progress for admin cards instead of team averages', () => {
    const viewModel = toTrainingCardViewModel(buildTrainingSummary(), 'admin');

    expect(viewModel.progress).toBe(50);
  });

  it('uses the generated training cover image for cards', () => {
    const viewModel = toTrainingCardViewModel(buildTrainingSummary(), 'admin');

    expect(viewModel.imageUrl).toBe('https://assets.example.com/training-covers/training-1.png');
    expect(viewModel.coverImageStatus).toBe('ready');
    expect(viewModel.imageAlt).toBe('Architecture Basics generated training cover');
  });

  it('does not fall back to stock images when the generated cover is missing', () => {
    const viewModel = toTrainingCardViewModel(
      buildTrainingSummary({
        coverImageUrl: null,
        coverImageStatus: 'generating',
      }),
      'admin',
    );

    expect(viewModel.imageUrl).toBeNull();
    expect(viewModel.coverImageStatus).toBe('generating');
    expect(viewModel.imageAlt).toBe(
      'Generated cover image is not available for Architecture Basics',
    );
  });

  it('falls back to zero when the viewer is not assigned', () => {
    const progress = resolveViewerTrainingProgress(
      buildTrainingSummary({
        viewerAssignmentId: null,
        viewerAssignmentStatus: null,
        viewerProgressPct: null,
      }),
    );

    expect(progress).toBe(0);
  });

  it('detects whether the viewer is assigned to the training', () => {
    expect(isViewerAssignedToTraining(buildTrainingSummary())).toBe(true);
    expect(
      isViewerAssignedToTraining(
        buildTrainingSummary({
          viewerAssignmentId: null,
        }),
      ),
    ).toBe(false);
  });
});
