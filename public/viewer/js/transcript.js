let generatedUtteranceSequence = 0;

function normalizeOptionalNumber(value, minimum = 0, maximum = Infinity) {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function normalizeWords(words) {
  if (!Array.isArray(words)) {
    return [];
  }

  return words
    .filter(word => word && typeof word === 'object')
    .map(word => ({
      ...word,
      text: typeof word.text === 'string' ? word.text.trim() : '',
      startTimeMs: normalizeOptionalNumber(word.startTimeMs),
      endTimeMs: normalizeOptionalNumber(word.endTimeMs),
      confidence: normalizeOptionalNumber(word.confidence, 0, 1)
    }))
    .filter(word => word.text);
}

function createGeneratedId(engine) {
  generatedUtteranceSequence += 1;
  return `${engine}-${Date.now()}-${generatedUtteranceSequence}`;
}

export function normalizeTranscript(input, defaults = {}) {
  const source = typeof input === 'string'
    ? { text: input }
    : input && typeof input === 'object'
      ? input
      : {};
  const engine = typeof source.engine === 'string' && source.engine.trim()
    ? source.engine.trim()
    : typeof defaults.engine === 'string' && defaults.engine.trim()
      ? defaults.engine.trim()
      : 'unknown';
  const utteranceId = typeof source.utteranceId === 'string' &&
    source.utteranceId.trim()
    ? source.utteranceId.trim()
    : typeof defaults.utteranceId === 'string' && defaults.utteranceId.trim()
      ? defaults.utteranceId.trim()
      : createGeneratedId(engine);

  return {
    ...source,
    utteranceId,
    text: typeof source.text === 'string' ? source.text.trim() : '',
    isFinal: typeof source.isFinal === 'boolean'
      ? source.isFinal
      : defaults.isFinal !== false,
    confidence: normalizeOptionalNumber(source.confidence, 0, 1),
    startTimeMs: normalizeOptionalNumber(source.startTimeMs),
    endTimeMs: normalizeOptionalNumber(source.endTimeMs),
    engine,
    words: normalizeWords(source.words)
  };
}

export function createManualTranscript(text, options = {}) {
  return normalizeTranscript(
    {
      ...options,
      text,
      isFinal: true,
      engine: 'manual'
    },
    { engine: 'manual', isFinal: true });
}
