import { matchTranscript } from
  '../public/viewer/js/object-matcher.js';

const PROFILES = {
  beaker: {
    displayName: '烧杯',
    objectType: 'beaker',
    category: 'container',
    function: 'mixing',
    color: 'colorless',
    transparency: 'transparent',
    shape: 'wide_cylinder',
    materials: ['glass'],
    aliases: ['烧杯', '玻璃烧杯', '透明烧杯', '杯状容器',
      'beaker', 'glass beaker']
  },
  chinaDish: {
    displayName: '蒸发皿',
    objectType: 'china_dish',
    category: 'container',
    function: 'evaporating',
    color: 'white',
    transparency: 'opaque',
    shape: 'shallow_dish',
    materials: ['ceramic'],
    aliases: ['蒸发皿', '瓷皿', '白色小皿', '蒸发盘',
      'china dish', 'evaporating dish', 'porcelain dish']
  },
  crucible: {
    displayName: '坩埚',
    objectType: 'crucible',
    category: 'container',
    function: 'heating',
    color: 'white',
    transparency: 'opaque',
    shape: 'small_bowl',
    materials: ['ceramic'],
    aliases: ['坩埚', '带盖坩埚', '瓷坩埚',
      'crucible', 'covered crucible', 'porcelain crucible']
  },
  florenceFlask: {
    displayName: '佛罗伦萨烧瓶',
    objectType: 'florence_flask',
    category: 'container',
    function: 'heating',
    color: 'colorless',
    transparency: 'transparent',
    shape: 'spherical_flask',
    materials: ['glass'],
    aliases: ['佛罗伦萨烧瓶', '平底烧瓶', '沸腾烧瓶', '烧瓶',
      'Florence flask', 'boiling flask']
  },
  funnel: {
    displayName: '玻璃漏斗',
    objectType: 'glass_funnel',
    category: 'tool',
    function: 'filtering',
    color: 'colorless',
    transparency: 'transparent',
    shape: 'funnel',
    materials: ['glass'],
    aliases: ['玻璃漏斗', '漏斗', '过滤漏斗', '透明漏斗',
      'glass funnel', 'filter funnel', 'funnel']
  },
  graduatedCylinder: {
    displayName: '量筒',
    objectType: 'graduated_cylinder',
    category: 'container',
    function: 'measuring',
    color: 'colorless',
    transparency: 'transparent',
    shape: 'tall_cylinder',
    materials: ['glass'],
    aliases: ['量筒', '刻度量筒', '刻度筒', '透明量筒',
      'graduated cylinder', 'measuring cylinder']
  },
  spiritLamp: {
    displayName: '酒精灯',
    objectType: 'spirit_lamp',
    category: 'device',
    function: 'heating',
    color: 'silver',
    transparency: 'opaque',
    shape: 'lamp',
    materials: ['metal', 'glass'],
    aliases: ['酒精灯', '加热灯', 'spirit lamp',
      'alcohol lamp', 'heating lamp']
  },
  testTube: {
    displayName: '试管',
    objectType: 'test_tube',
    category: 'container',
    function: 'holding',
    color: 'colorless',
    transparency: 'transparent',
    shape: 'slender_tube',
    materials: ['glass'],
    aliases: ['试管', '玻璃试管', '透明试管',
      'test tube', 'glass test tube']
  }
};

function makeObject(id, profile, contents, options = {}) {
  const hasContents = contents !== 'none';
  const stateTags = contents === 'water'
    ? ['contains_liquid', 'contains_water']
    : hasContents ? ['contains_liquid'] : ['empty'];
  return {
    id,
    ...profile,
    contents,
    contentColor: contents === 'water'
      ? 'colorless'
      : hasContents ? 'unspecified' : 'none',
    stateTags,
    selectable: true,
    grabbable: options.grabbable === true
  };
}

function makeAStageCatalog() {
  return [
    makeObject('complex_beaker_water', PROFILES.beaker, 'water'),
    makeObject('florence_flask', PROFILES.florenceFlask, 'water',
      { grabbable: true }),
    makeObject('complex_china_dish', PROFILES.chinaDish, 'none'),
    makeObject('complex_test_tube_empty', PROFILES.testTube, 'none'),
    makeObject('complex_test_tube_liquid', PROFILES.testTube, 'liquid'),
    makeObject('complex_florence_flask_empty',
      PROFILES.florenceFlask, 'none'),
    makeObject('complex_crucible_tongs', {
      displayName: '坩埚钳',
      objectType: 'crucible_tongs',
      category: 'tool',
      function: 'handling',
      color: 'silver',
      transparency: 'opaque',
      shape: 'scissor_tongs',
      materials: ['metal'],
      aliases: ['坩埚钳', '坩埚夹', '夹钳', 'crucible tongs']
    }, 'none'),
    makeObject('spirit_lamp', PROFILES.spiritLamp, 'water',
      { grabbable: true }),
    makeObject('complex_crucible_with_cover', PROFILES.crucible, 'none'),
    makeObject('test_tube_rack', {
      displayName: '试管架',
      objectType: 'test_tube_rack',
      category: 'support',
      function: 'supporting',
      color: 'brown',
      transparency: 'opaque',
      shape: 'rectangular_rack',
      materials: ['wood'],
      aliases: ['试管架', '试管支架', '管架', '木制试管架',
        'test tube rack', 'tube rack']
    }, 'none', { grabbable: true }),
    makeObject('complex_glass_funnel', PROFILES.funnel, 'none'),
    makeObject('complex_graduated_cylinder_liquid',
      PROFILES.graduatedCylinder, 'liquid'),
    makeObject('complex_spirit_lamp_water', PROFILES.spiritLamp, 'water'),
    makeObject('complex_test_tube_water', PROFILES.testTube, 'water'),
    makeObject('dropper', {
      displayName: '玻璃滴管',
      objectType: 'dropper',
      category: 'tool',
      function: 'transferring',
      color: 'colorless',
      transparency: 'transparent',
      shape: 'slender_tube',
      materials: ['glass', 'rubber'],
      aliases: ['滴管', '玻璃滴管', '滴液管', '透明滴管',
        'dropper', 'glass dropper']
    }, 'none', { grabbable: true }),
    makeObject('china_dish', PROFILES.chinaDish, 'none',
      { grabbable: true }),
    makeObject('glass_funnel', PROFILES.funnel, 'none',
      { grabbable: true }),
    makeObject('beaker', PROFILES.beaker, 'water',
      { grabbable: true }),
    makeObject('graduated_cylinder',
      PROFILES.graduatedCylinder, 'none', { grabbable: true })
  ];
}

function candidateIds(result) {
  return result.candidates.map(candidate => candidate.id);
}

describe('matchTranscript with the 19-object AStage catalog', () => {
  const catalog = makeAStageCatalog();

  test('extracts canonical object type and transparency together', () => {
    const result = matchTranscript('透明量筒', catalog);

    expect(result.reason).toBe('matched');
    expect(result.extractedSlots).toEqual({
      objectType: ['graduated_cylinder'],
      transparency: ['transparent']
    });
    expect(candidateIds(result)).toEqual([
      'complex_graduated_cylinder_liquid',
      'graduated_cylinder'
    ]);
  });

  test('uses a liquid phrase to resolve the ambiguous cylinders', () => {
    const result = matchTranscript('装有液体的透明量筒', catalog);

    expect(result.extractedSlots).toMatchObject({
      objectType: ['graduated_cylinder'],
      contents: ['liquid'],
      transparency: ['transparent']
    });
    expect(candidateIds(result)).toEqual([
      'complex_graduated_cylinder_liquid'
    ]);
  });

  test('distinguishes water and empty test tubes', () => {
    const waterResult = matchTranscript('装水的试管', catalog);
    const emptyResult = matchTranscript('空试管', catalog);

    expect(candidateIds(waterResult)).toEqual([
      'complex_test_tube_water'
    ]);
    expect(candidateIds(emptyResult)).toEqual([
      'complex_test_tube_empty'
    ]);
  });

  test('returns all compatible white ceramic containers', () => {
    const result = matchTranscript('白色陶瓷容器', catalog);

    expect(candidateIds(result)).toEqual([
      'china_dish',
      'complex_china_dish',
      'complex_crucible_with_cover'
    ]);
  });

  test('supports an English command and catalog identity phrase', () => {
    const result = matchTranscript('select the glass funnel', catalog);

    expect(result.normalizedText).toBe('glass funnel');
    expect(result.extractedSlots).toMatchObject({
      objectType: ['glass_funnel'],
      materials: ['glass']
    });
    expect(candidateIds(result)).toEqual([
      'complex_glass_funnel',
      'glass_funnel'
    ]);
  });

  test('rejects an explicitly incompatible red box', () => {
    const result = matchTranscript('select the red box', catalog);

    expect(result.reason).toBe('no_compatible_candidate');
    expect(result.extractedSlots).toEqual({
      color: ['red'],
      shape: ['box']
    });
    expect(result.candidates).toEqual([]);
  });

  test('does not guess when there is no semantic evidence', () => {
    const result = matchTranscript('please identify the quantum banana',
      catalog);

    expect(result.reason).toBe('no_semantic_evidence');
    expect(result.candidates).toEqual([]);
    expect(result.rejectedCandidates).toEqual([]);
  });

  test('does not match an interim STT transcript', () => {
    const result = matchTranscript({
      utteranceId: 'interim-1',
      text: '透明量筒',
      isFinal: false,
      confidence: 0.99,
      engine: 'mock-stt'
    }, catalog);

    expect(result.reason).toBe('transcript_not_final');
    expect(result.candidates).toEqual([]);
    expect(result.transcript.utteranceId).toBe('interim-1');
  });

  test('orders equal-score candidates by Stable ID deterministically', () => {
    const forward = matchTranscript('透明量筒', catalog);
    const reverse = matchTranscript('透明量筒', [...catalog].reverse());

    expect(candidateIds(reverse)).toEqual(candidateIds(forward));
  });

  test('preserves STT metadata without using confidence in the score', () => {
    const lowConfidence = matchTranscript({
      utteranceId: 'speech-low',
      text: '装水的试管',
      isFinal: true,
      confidence: 0.1,
      engine: 'partner-sdk',
      rawSegmentId: 'segment-17'
    }, catalog);
    const highConfidence = matchTranscript({
      utteranceId: 'speech-high',
      text: '装水的试管',
      isFinal: true,
      confidence: 0.99,
      engine: 'another-sdk'
    }, catalog);

    expect(lowConfidence.transcript).toMatchObject({
      utteranceId: 'speech-low',
      confidence: 0.1,
      engine: 'partner-sdk',
      rawSegmentId: 'segment-17'
    });
    expect(candidateIds(lowConfidence)).toEqual(candidateIds(highConfidence));
    expect(lowConfidence.candidates.map(candidate => candidate.score))
      .toEqual(highConfidence.candidates.map(candidate => candidate.score));
  });
});
