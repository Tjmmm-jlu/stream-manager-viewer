import {
  computeThumbnailCrop,
  createOverlayRect,
  normalizeCandidateVisual
} from '../public/viewer/js/candidate-visualizer.js';

describe('candidate visual geometry', () => {
  test('normalizes Unity viewport bounds and converts the Y origin', () => {
    const visual = normalizeCandidateVisual({
      id: 'graduated_cylinder',
      displayName: '量筒',
      hasBounds: true,
      visible: true,
      xMin: 0.2,
      yMin: 0.25,
      xMax: 0.5,
      yMax: 0.75,
      depth: 3.2
    });

    expect(visual).toMatchObject({
      id: 'graduated_cylinder',
      visible: true,
      depth: 3.2
    });
    expect(createOverlayRect(visual)).toEqual({
      left: 20,
      top: 25,
      width: 30,
      height: 50
    });
  });

  test('rejects invalid and zero-area visual bounds', () => {
    expect(normalizeCandidateVisual(null)).toBeNull();
    expect(normalizeCandidateVisual({ id: ' ' })).toBeNull();

    const visual = normalizeCandidateVisual({
      id: 'test_tube',
      hasBounds: true,
      visible: true,
      xMin: 0.3,
      yMin: 0.3,
      xMax: 0.3,
      yMax: 0.8
    });
    expect(visual.visible).toBe(false);
    expect(createOverlayRect(visual)).toBeNull();
  });

  test('clamps partially off-screen bounds to the video viewport', () => {
    const visual = normalizeCandidateVisual({
      id: 'beaker',
      hasBounds: true,
      visible: true,
      xMin: -0.2,
      yMin: 0.1,
      xMax: 1.2,
      yMax: 0.9
    });

    expect(visual).toMatchObject({
      xMin: 0,
      yMin: 0.1,
      xMax: 1,
      yMax: 0.9,
      visible: true
    });
  });

  test('creates a padded 16:9 crop inside the current video frame', () => {
    const visual = normalizeCandidateVisual({
      id: 'test_tube',
      hasBounds: true,
      visible: true,
      xMin: 0.45,
      yMin: 0.35,
      xMax: 0.55,
      yMax: 0.75
    });
    const crop = computeThumbnailCrop(visual, 1280, 720);

    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1280);
    expect(crop.y + crop.height).toBeLessThanOrEqual(720);
    expect(crop.width / crop.height).toBeCloseTo(16 / 9, 5);
  });

  test('returns no crop for an off-screen candidate or missing video', () => {
    const hiddenVisual = normalizeCandidateVisual({
      id: 'offscreen',
      hasBounds: true,
      visible: false,
      xMin: 0.1,
      yMin: 0.1,
      xMax: 0.2,
      yMax: 0.2
    });

    expect(computeThumbnailCrop(hiddenVisual, 1280, 720)).toBeNull();
    expect(computeThumbnailCrop({ visible: true }, 0, 0)).toBeNull();
  });
});
