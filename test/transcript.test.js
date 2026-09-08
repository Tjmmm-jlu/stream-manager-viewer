import {
  createManualTranscript,
  normalizeTranscript
} from '../public/viewer/js/transcript.js';

describe('normalizeTranscript', () => {
  test('creates the stable internal envelope from an SDK result', () => {
    const transcript = normalizeTranscript({
      utteranceId: 'partner-42',
      text: '  装水的试管  ',
      isFinal: true,
      confidence: 0.87,
      startTimeMs: 120,
      endTimeMs: 940,
      engine: 'partner-sdk',
      sdkRequestId: 'request-9',
      words: [
        {
          text: '  试管 ',
          startTimeMs: 500,
          endTimeMs: 900,
          confidence: 0.91,
          vendorTokenId: 7
        },
        { text: '   ' },
        null
      ]
    });

    expect(transcript).toEqual({
      utteranceId: 'partner-42',
      text: '装水的试管',
      isFinal: true,
      confidence: 0.87,
      startTimeMs: 120,
      endTimeMs: 940,
      engine: 'partner-sdk',
      sdkRequestId: 'request-9',
      words: [{
        text: '试管',
        startTimeMs: 500,
        endTimeMs: 900,
        confidence: 0.91,
        vendorTokenId: 7
      }]
    });
  });

  test('keeps an interim result interim and normalizes invalid metadata', () => {
    const transcript = normalizeTranscript({
      text: '量筒',
      isFinal: false,
      confidence: 1.5,
      startTimeMs: -1,
      endTimeMs: Number.NaN,
      words: 'not-an-array'
    }, {
      utteranceId: 'fallback-id',
      engine: 'mock-stt'
    });

    expect(transcript).toEqual({
      utteranceId: 'fallback-id',
      text: '量筒',
      isFinal: false,
      confidence: null,
      startTimeMs: null,
      endTimeMs: null,
      engine: 'mock-stt',
      words: []
    });
  });

  test('creates a final manual transcript without an STT SDK', () => {
    const transcript = createManualTranscript('  透明量筒  ', {
      utteranceId: 'manual-001',
      confidence: 0.2
    });

    expect(transcript).toMatchObject({
      utteranceId: 'manual-001',
      text: '透明量筒',
      isFinal: true,
      confidence: 0.2,
      engine: 'manual',
      words: []
    });
  });
});
