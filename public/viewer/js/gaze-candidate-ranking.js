const DEFAULT_OPTIONS = Object.freeze({
  semanticWeight: 0.7,
  gazeWeight: 0.3,
  sigma: 0.12,
  regionRadius: 0.15,
  maxAgeMs: 1200
});

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeGazePoint(gaze, maxAgeMs) {
  if (!gaze || gaze.valid !== true ||
      !finiteNumber(gaze.videoX) || !finiteNumber(gaze.videoY)) {
    return null;
  }

  if (finiteNumber(gaze.receivedAt) &&
      Date.now() - gaze.receivedAt > maxAgeMs) {
    return null;
  }

  return {
    x: clamp(gaze.videoX, 0, 1),
    y: clamp(gaze.videoY, 0, 1)
  };
}

function distanceToVisualBox(point, visual) {
  const left = clamp(visual.xMin, 0, 1);
  const right = clamp(visual.xMax, 0, 1);
  const top = clamp(1 - visual.yMax, 0, 1);
  const bottom = clamp(1 - visual.yMin, 0, 1);
  const horizontalDistance = point.x < left
    ? left - point.x
    : point.x > right ? point.x - right : 0;
  const verticalDistance = point.y < top
    ? top - point.y
    : point.y > bottom ? point.y - bottom : 0;
  return Math.hypot(horizontalDistance, verticalDistance);
}

function compareIds(left, right) {
  return String(left).localeCompare(String(right));
}

/**
 * Ranks semantic candidates with gaze as a soft spatial constraint.
 * Unity visual bounds use a bottom-left origin; browser gaze coordinates use
 * the video's top-left origin, so the Y axis is converted here.
 */
export function rankCandidatesWithGaze(
  candidates,
  visuals,
  gaze,
  options = {}) {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const sourceCandidates = Array.isArray(candidates) ? candidates : [];
  const visualById = new Map(
    (Array.isArray(visuals) ? visuals : [])
      .filter(visual => visual && typeof visual.id === 'string')
      .map(visual => [visual.id, visual]));
  const point = normalizeGazePoint(gaze, settings.maxAgeMs);
  const hasUsableVisual = Array.from(visualById.values()).some(visual =>
    visual?.visible === true && visual.hasBounds === true);

  if (!point || !hasUsableVisual || sourceCandidates.length < 2) {
    return {
      active: false,
      reason: !point
        ? 'gaze_unavailable'
        : !hasUsableVisual
          ? 'visuals_unavailable'
          : 'not_enough_candidates',
      point,
      candidates: sourceCandidates.map(candidate => ({ ...candidate }))
    };
  }

  const semanticMaximum = Math.max(
    1,
    ...sourceCandidates.map(candidate =>
      finiteNumber(candidate.score) ? candidate.score : 0));
  const ranked = sourceCandidates.map((candidate, sourceIndex) => {
    const visual = visualById.get(candidate.id);
    const hasVisibleBounds = visual?.visible === true &&
      visual.hasBounds === true &&
      finiteNumber(visual.xMin) && finiteNumber(visual.yMin) &&
      finiteNumber(visual.xMax) && finiteNumber(visual.yMax) &&
      visual.xMax > visual.xMin && visual.yMax > visual.yMin;

    if (!hasVisibleBounds) {
      return {
        ...candidate,
        gazeScore: null,
        gazeDistance: null,
        gazeInRegion: false,
        combinedScore: finiteNumber(candidate.score)
          ? candidate.score / semanticMaximum
          : 0,
        _sourceIndex: sourceIndex
      };
    }

    const gazeDistance = distanceToVisualBox(point, visual);
    const sigma = Math.max(0.001, settings.sigma);
    const gazeScore = Math.exp(
      -(gazeDistance * gazeDistance) / (2 * sigma * sigma));
    const semanticScore = finiteNumber(candidate.score)
      ? candidate.score / semanticMaximum
      : 0;
    const combinedScore =
      settings.semanticWeight * semanticScore +
      settings.gazeWeight * gazeScore;

    return {
      ...candidate,
      gazeScore,
      gazeDistance,
      gazeInRegion: gazeDistance <= settings.regionRadius,
      combinedScore,
      _sourceIndex: sourceIndex
    };
  });

  ranked.sort((left, right) =>
    right.combinedScore - left.combinedScore ||
    (right.gazeScore ?? -1) - (left.gazeScore ?? -1) ||
    (right.score || 0) - (left.score || 0) ||
    left._sourceIndex - right._sourceIndex ||
    compareIds(left.id, right.id));

  return {
    active: true,
    reason: 'gaze_applied',
    point,
    candidates: ranked.map(({ _sourceIndex, ...candidate }) => candidate)
  };
}
