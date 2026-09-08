import { createSemanticMatchViewModel } from
  '../public/viewer/js/semantic-match-ui.js';

describe('createSemanticMatchViewModel', () => {
  test('prepares ranked candidates and a preferred Stable ID for the UI', () => {
    const viewModel = createSemanticMatchViewModel({
      reason: 'matched',
      extractedSlots: {
        objectType: ['graduated_cylinder'],
        transparency: ['transparent']
      },
      candidates: [
        {
          id: 'complex_graduated_cylinder_liquid',
          displayName: '量筒',
          score: 130,
          matchedFields: [
            { field: 'objectType' },
            { field: 'transparency' }
          ],
          conflicts: []
        },
        {
          id: 'graduated_cylinder',
          displayName: '量筒',
          score: 130,
          matchedFields: [
            { field: 'objectType' },
            { field: 'transparency' }
          ],
          conflicts: []
        }
      ],
      rejectedCandidates: []
    });

    expect(viewModel.slotEntries).toEqual([
      { field: 'objectType', value: 'graduated_cylinder' },
      { field: 'transparency', value: 'transparent' }
    ]);
    expect(viewModel.candidates.map(candidate => candidate.id)).toEqual([
      'complex_graduated_cylinder_liquid',
      'graduated_cylinder'
    ]);
    expect(viewModel.candidates[0].matchedFields)
      .toBe('objectType, transparency');
    expect(viewModel.preferredId)
      .toBe('complex_graduated_cylinder_liquid');
  });

  test('exposes rejected candidate conflict fields', () => {
    const viewModel = createSemanticMatchViewModel({
      reason: 'no_compatible_candidate',
      extractedSlots: { color: ['red'], shape: ['box'] },
      candidates: [],
      rejectedCandidates: [{
        id: 'red_beaker',
        displayName: '红色烧杯',
        score: 30,
        matchedFields: [{ field: 'color' }],
        conflicts: [{ field: 'shape' }, { field: 'objectType' }]
      }]
    });

    expect(viewModel.preferredId).toBe('');
    expect(viewModel.rejectedCandidates).toEqual([{
      id: 'red_beaker',
      conflictFields: 'shape, objectType'
    }]);
  });

  test('handles an empty result defensively', () => {
    expect(createSemanticMatchViewModel(null)).toEqual({
      reason: 'empty_transcript',
      slotEntries: [],
      candidates: [],
      rejectedCandidates: [],
      preferredId: ''
    });
  });
});
