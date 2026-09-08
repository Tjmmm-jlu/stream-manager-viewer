import { normalizeTranscript } from './transcript.js';

const FIELD_WEIGHTS = Object.freeze({
  objectType: 100,
  contents: 40,
  stateTags: 40,
  contentColor: 30,
  color: 30,
  transparency: 30,
  materials: 25,
  shape: 20,
  function: 15,
  category: 10
});

const ARRAY_FIELDS = new Set(['materials', 'stateTags']);

const COMMAND_PHRASES = [
  'on the table', 'please', 'select', 'choose', 'pick up', 'point out',
  'find', 'the', 'that', 'this', 'target is',
  '桌面上的', '桌子上的', '请帮我', '请选择', '请选中', '目标是',
  '桌上的', '帮我', '选择', '选中', '拿起', '指出', '找出', '那个', '这个'
];

const ATTRIBUTE_DEFINITIONS = [
  ['category', 'container', ['容器', '器皿', 'container', 'vessel']],
  ['category', 'tool', ['工具', 'tool']],
  ['category', 'device', ['装置', '设备', 'device']],
  ['category', 'support', ['支架', '架子', 'support', 'rack']],

  ['function', 'measuring', ['测量', '计量', 'measuring', 'measure']],
  ['function', 'heating', ['加热', 'heating', 'heat']],
  ['function', 'filtering', ['过滤', 'filtering', 'filter']],
  ['function', 'transferring', ['转移', '滴加', '移液', 'transferring', 'transfer']],
  ['function', 'handling', ['夹取', '夹持', 'handling', 'gripping']],
  ['function', 'supporting', ['支撑', '放置试管', 'supporting']],
  ['function', 'evaporating', ['蒸发', 'evaporating']],
  ['function', 'mixing', ['混合', '搅拌', 'mixing']],
  ['function', 'holding', ['盛放', '容纳', 'holding']],

  ['color', 'colorless', ['无色', '无色的', 'colorless']],
  ['color', 'white', ['白色', '白色的', 'white']],
  ['color', 'silver', ['银色', '银灰色', 'silver']],
  ['color', 'brown', ['棕色', '褐色', '木色', 'brown']],
  ['color', 'red', ['红色', '红色的', 'red']],
  ['color', 'blue', ['蓝色', '蓝色的', 'blue']],
  ['color', 'green', ['绿色', '绿色的', 'green']],
  ['color', 'yellow', ['黄色', '黄色的', 'yellow']],
  ['color', 'black', ['黑色', '黑色的', 'black']],
  ['color', 'gray', ['灰色', '灰色的', 'grey', 'gray']],

  ['transparency', 'transparent', ['透明的', '透明', 'transparent', 'clear']],
  ['transparency', 'opaque', ['不透明的', '不透明', 'opaque']],

  ['shape', 'wide_cylinder', ['宽圆柱', '宽圆筒', '矮圆柱', 'wide cylinder']],
  ['shape', 'tall_cylinder', ['细长圆柱', '细长圆筒', '高圆柱', '高圆筒', 'tall cylinder']],
  ['shape', 'slender_tube', ['细长管', '细管', '管状', 'slender tube', 'tubular']],
  ['shape', 'shallow_dish', ['浅盘', '浅皿', '盘状', 'shallow dish']],
  ['shape', 'spherical_flask', ['球形瓶', '圆球形', '球形', 'spherical flask', 'round flask']],
  ['shape', 'conical_flask', ['锥形瓶', '三角瓶', 'conical flask']],
  ['shape', 'funnel', ['漏斗形', 'funnel shaped']],
  ['shape', 'lamp', ['灯形', 'lamp shaped']],
  ['shape', 'rectangular_rack', ['长方形架', '矩形架', 'rectangular rack']],
  ['shape', 'small_bowl', ['小碗形', '碗状', 'small bowl']],
  ['shape', 'scissor_tongs', ['剪刀形', '钳形', 'scissor tongs']],
  ['shape', 'slender_tool', ['细长工具', 'slender tool']],
  ['shape', 'box', ['方形盒', '长方形盒', '方盒', '盒子', 'square box', 'rectangular box', 'box']],

  ['materials', 'glass', ['玻璃', 'glass']],
  ['materials', 'ceramic', ['陶瓷', '瓷质', '瓷', 'ceramic', 'porcelain']],
  ['materials', 'metal', ['金属', 'metallic', 'metal']],
  ['materials', 'rubber', ['橡胶', 'rubber']],
  ['materials', 'wood', ['木制', '木质', 'wooden', 'wood']],

  ['contents', 'none', ['没有液体', '不含液体', '无液体', 'without liquid', 'no liquid']],
  ['contents', 'water', ['装有水', '装水', '有水', '带水', 'contains water', 'with water', 'water']],
  ['contents', 'liquid', ['装有液体', '装液体', '有液体', '带液体', 'contains liquid', 'with liquid', 'liquid']],
  ['stateTags', 'empty', ['空的', '空', 'empty']],

  ['contentColor', 'white', ['白色液体', '白色的液体', 'white liquid']],
  ['contentColor', 'red', ['红色液体', '红色的液体', 'red liquid']],
  ['contentColor', 'blue', ['蓝色液体', '蓝色的液体', 'blue liquid']],
  ['contentColor', 'green', ['绿色液体', '绿色的液体', 'green liquid']],
  ['contentColor', 'yellow', ['黄色液体', '黄色的液体', 'yellow liquid']],
  ['contentColor', 'colorless', ['无色液体', '无色的液体', 'colorless liquid']]
];

function normalizePhrase(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[，。！？、；：,.!?;:()[\]{}"'“”‘’/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCanonical(value) {
  return normalizePhrase(value).replace(/\s+/g, '_');
}

function isAsciiWordCharacter(character) {
  return Boolean(character) && /[a-z0-9]/i.test(character);
}

function hasValidBoundaries(text, start, phrase) {
  const before = start > 0 ? text[start - 1] : '';
  const afterIndex = start + phrase.length;
  const after = afterIndex < text.length ? text[afterIndex] : '';
  const first = phrase[0];
  const last = phrase[phrase.length - 1];
  return (!isAsciiWordCharacter(first) || !isAsciiWordCharacter(before)) &&
    (!isAsciiWordCharacter(last) || !isAsciiWordCharacter(after));
}

function replacePhrase(text, phrase) {
  let result = '';
  let cursor = 0;
  let match = text.indexOf(phrase, cursor);
  while (match >= 0) {
    if (hasValidBoundaries(text, match, phrase)) {
      result += text.slice(cursor, match) + ' ';
      cursor = match + phrase.length;
    } else {
      result += text.slice(cursor, match + 1);
      cursor = match + 1;
    }
    match = text.indexOf(phrase, cursor);
  }
  return result + text.slice(cursor);
}

function removeCommandPhrases(text) {
  return COMMAND_PHRASES
    .map(normalizePhrase)
    .sort((left, right) => right.length - left.length)
    .reduce((result, phrase) => replacePhrase(result, phrase), text)
    .replace(/\s+/g, ' ')
    .trim();
}

function createEntry(field, value, phrase, source) {
  const normalizedPhrase = normalizePhrase(phrase);
  if (!normalizedPhrase) {
    return null;
  }
  return {
    field,
    value: normalizeCanonical(value),
    phrase: normalizedPhrase,
    source
  };
}

function buildLexicon(catalog) {
  const entries = [];
  ATTRIBUTE_DEFINITIONS.forEach(([field, value, phrases]) => {
    phrases.forEach((phrase) => {
      entries.push(createEntry(field, value, phrase, 'attribute_lexicon'));
    });
  });

  catalog.forEach((object) => {
    const objectType = normalizeCanonical(object.objectType);
    if (!objectType) {
      return;
    }

    const terms = [
      object.displayName,
      object.objectType,
      ...(Array.isArray(object.aliases) ? object.aliases : [])
    ];
    terms.forEach((term) => {
      entries.push(createEntry(
        'objectType', objectType, term, 'catalog_identity'));
    });
  });

  const unique = new Map();
  entries.filter(Boolean).forEach((entry) => {
    const key = `${entry.field}|${entry.value}|${entry.phrase}`;
    if (!unique.has(key)) {
      unique.set(key, entry);
    }
  });
  return Array.from(unique.values());
}

function findPhraseSpans(text, phrase) {
  const spans = [];
  let cursor = 0;
  let start = text.indexOf(phrase, cursor);
  while (start >= 0) {
    if (hasValidBoundaries(text, start, phrase)) {
      spans.push({ start, end: start + phrase.length });
    }
    cursor = start + Math.max(1, phrase.length);
    start = text.indexOf(phrase, cursor);
  }
  return spans;
}

function spansOverlap(left, right) {
  return left.start < right.end && right.start < left.end;
}

function extractEvidence(text, catalog) {
  const byField = new Map();
  buildLexicon(catalog).forEach((entry) => {
    findPhraseSpans(text, entry.phrase).forEach((span) => {
      if (!byField.has(entry.field)) {
        byField.set(entry.field, []);
      }
      byField.get(entry.field).push({ ...entry, ...span });
    });
  });

  const selected = [];
  byField.forEach((matches) => {
    const acceptedSpans = [];
    matches
      .sort((left, right) =>
        (right.end - right.start) - (left.end - left.start) ||
        left.start - right.start ||
        left.value.localeCompare(right.value))
      .forEach((match) => {
        const overlap = acceptedSpans.find(span => spansOverlap(span, match));
        const sameSpan = overlap &&
          overlap.start === match.start &&
          overlap.end === match.end;
        if (!overlap || sameSpan) {
          selected.push(match);
          acceptedSpans.push({ start: match.start, end: match.end });
        }
      });
  });

  const contentColorSpans = selected
    .filter(item => item.field === 'contentColor');
  const contextFiltered = selected.filter((item) => {
    if (item.field !== 'color') {
      return true;
    }
    return !contentColorSpans.some(span =>
      item.start >= span.start && item.end <= span.end);
  });

  const uniqueEvidence = new Map();
  contextFiltered
    .sort((left, right) =>
      left.start - right.start ||
      (right.end - right.start) - (left.end - left.start))
    .forEach((item) => {
      const key = `${item.field}|${item.value}`;
      if (!uniqueEvidence.has(key)) {
        uniqueEvidence.set(key, item);
      }
    });
  return Array.from(uniqueEvidence.values());
}

function groupEvidence(evidence) {
  const grouped = new Map();
  evidence.forEach((item) => {
    if (!grouped.has(item.field)) {
      grouped.set(item.field, []);
    }
    grouped.get(item.field).push(item);
  });
  return grouped;
}

function valuesForObject(object, field) {
  const rawValue = object[field];
  const values = ARRAY_FIELDS.has(field)
    ? Array.isArray(rawValue) ? rawValue : []
    : [rawValue];
  return values.map(normalizeCanonical).filter(Boolean);
}

function valuesMatch(field, candidateValue, queryValue) {
  if (candidateValue === queryValue) {
    return true;
  }
  if (field === 'contents' && queryValue === 'liquid') {
    return candidateValue === 'water';
  }
  return false;
}

function evaluateCandidate(object, groupedEvidence) {
  const matchedFields = [];
  const conflicts = [];
  groupedEvidence.forEach((items, field) => {
    const candidateValues = valuesForObject(object, field);
    const matchedItems = items.filter(item => candidateValues.some(value =>
      valuesMatch(field, value, item.value)));
    const detail = {
      field,
      candidateValues,
      queryValues: items.map(item => item.value),
      phrases: items.map(item => item.phrase),
      weight: FIELD_WEIGHTS[field] || 0
    };
    if (matchedItems.length > 0) {
      matchedFields.push(detail);
    } else {
      conflicts.push(detail);
    }
  });

  const score = matchedFields.reduce(
    (total, match) => total + match.weight,
    0);
  return {
    id: object.id,
    displayName: object.displayName,
    objectType: object.objectType,
    score,
    matchedFields,
    conflicts
  };
}

function createExtractedSlots(evidence) {
  const slots = {};
  evidence.forEach((item) => {
    if (!slots[item.field]) {
      slots[item.field] = [];
    }
    if (!slots[item.field].includes(item.value)) {
      slots[item.field].push(item.value);
    }
  });
  return slots;
}

function emptyResult(transcript, normalizedText, reason) {
  return {
    transcript,
    normalizedText,
    extractedSlots: {},
    recognizedPhrases: [],
    candidates: [],
    rejectedCandidates: [],
    reason
  };
}

export function matchTranscript(input, catalog, options = {}) {
  const transcript = normalizeTranscript(input, {
    engine: typeof input === 'string' ? 'manual' : 'unknown',
    isFinal: true
  });
  const normalizedText = removeCommandPhrases(normalizePhrase(transcript.text));
  if (!transcript.isFinal) {
    return emptyResult(transcript, normalizedText, 'transcript_not_final');
  }
  if (!normalizedText) {
    return emptyResult(transcript, normalizedText, 'empty_transcript');
  }
  if (!Array.isArray(catalog) || catalog.length === 0) {
    return emptyResult(transcript, normalizedText, 'empty_catalog');
  }

  const evidence = extractEvidence(normalizedText, catalog);
  if (evidence.length === 0) {
    return emptyResult(transcript, normalizedText, 'no_semantic_evidence');
  }

  const groupedEvidence = groupEvidence(evidence);
  const evaluated = catalog
    .filter(object => object && object.id)
    .filter(object => options.selectableOnly === false || object.selectable)
    .map(object => evaluateCandidate(object, groupedEvidence));
  const sortCandidates = (left, right) =>
    right.score - left.score || left.id.localeCompare(right.id);
  const candidates = evaluated
    .filter(candidate =>
      candidate.matchedFields.length > 0 && candidate.conflicts.length === 0)
    .sort(sortCandidates);
  const rejectedCandidates = evaluated
    .filter(candidate =>
      candidate.matchedFields.length > 0 && candidate.conflicts.length > 0)
    .sort(sortCandidates);

  return {
    transcript,
    normalizedText,
    extractedSlots: createExtractedSlots(evidence),
    recognizedPhrases: evidence.map(item => ({
      phrase: item.phrase,
      field: item.field,
      value: item.value,
      source: item.source
    })),
    candidates,
    rejectedCandidates,
    reason: candidates.length > 0 ? 'matched' : 'no_compatible_candidate'
  };
}
