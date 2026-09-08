import { ingestObjectCatalog } from
  '../public/viewer/js/object-catalog.js';

const ASTAGE_IDS = [
  'beaker',
  'china_dish',
  'complex_beaker_water',
  'complex_china_dish',
  'complex_crucible_tongs',
  'complex_crucible_with_cover',
  'complex_florence_flask_empty',
  'complex_glass_funnel',
  'complex_graduated_cylinder_liquid',
  'complex_spirit_lamp_water',
  'complex_test_tube_empty',
  'complex_test_tube_liquid',
  'complex_test_tube_water',
  'dropper',
  'florence_flask',
  'glass_funnel',
  'graduated_cylinder',
  'spirit_lamp',
  'test_tube_rack'
];

function makeObject(id, overrides = {}) {
  return {
    id,
    displayName: id,
    objectType: 'laboratory_apparatus',
    category: 'container',
    function: 'holding',
    color: 'colorless',
    transparency: 'transparent',
    shape: 'cylinder',
    materials: ['glass'],
    contents: 'none',
    contentColor: 'none',
    stateTags: ['empty'],
    aliases: [id],
    selectable: true,
    grabbable: false,
    ...overrides
  };
}

function makeAStageCatalog() {
  return ASTAGE_IDS.map(id => makeObject(id));
}

describe('ingestObjectCatalog', () => {
  test('accepts and preserves the complete 19-object AStage catalog', () => {
    const catalog = makeAStageCatalog();
    catalog[0].futureSpatialBounds = { x: 10, y: 20 };

    const result = ingestObjectCatalog(catalog, { declaredCount: 19 });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.objects).toHaveLength(19);
    expect(result.objects[0].futureSpatialBounds).toEqual({ x: 10, y: 20 });
  });

  test('normalizes whitespace and removes duplicate array values', () => {
    const object = makeObject(' beaker ', {
      materials: [' glass ', 'GLASS'],
      stateTags: [' empty ', 'EMPTY'],
      aliases: [' 烧杯 ', '烧杯', 'beaker']
    });

    const result = ingestObjectCatalog([object], { declaredCount: 1 });

    expect(result.ok).toBe(true);
    expect(result.objects[0].id).toBe('beaker');
    expect(result.objects[0].materials).toEqual(['glass']);
    expect(result.objects[0].stateTags).toEqual(['empty']);
    expect(result.objects[0].aliases).toEqual(['烧杯', 'beaker']);
  });

  test('rejects duplicate Stable IDs case-insensitively', () => {
    const result = ingestObjectCatalog([
      makeObject('graduated_cylinder'),
      makeObject('GRADUATED_CYLINDER')
    ], { declaredCount: 2 });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'duplicate_id',
        id: 'GRADUATED_CYLINDER'
      })
    ]));
  });

  test('rejects missing semantic fields and invalid capability flags', () => {
    const incomplete = makeObject('test_tube');
    delete incomplete.transparency;
    incomplete.materials = [];
    incomplete.selectable = 'true';

    const result = ingestObjectCatalog([incomplete]);
    const codes = result.errors.map(error => error.code);

    expect(result.ok).toBe(false);
    expect(codes).toContain('missing_string_field');
    expect(codes).toContain('missing_array_field');
    expect(codes).toContain('invalid_boolean_field');
  });

  test('rejects a candidateCount that differs from the payload length', () => {
    const result = ingestObjectCatalog(
      [makeObject('beaker')],
      { declaredCount: 19 });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'count_mismatch',
        declaredCount: 19,
        actualCount: 1
      })
    ]));
  });

  test('rejects non-array catalog payloads without throwing', () => {
    const result = ingestObjectCatalog(null, { declaredCount: 0 });

    expect(result.ok).toBe(false);
    expect(result.objects).toEqual([]);
    expect(result.errors[0].code).toBe('catalog_not_array');
  });
});
