const REQUIRED_STRING_FIELDS = [
  'id',
  'displayName',
  'objectType',
  'category',
  'function',
  'color',
  'transparency',
  'shape',
  'contents',
  'contentColor'
];

const REQUIRED_ARRAY_FIELDS = [
  'materials',
  'stateTags',
  'aliases'
];

const REQUIRED_BOOLEAN_FIELDS = [
  'selectable',
  'grabbable'
];

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  return value
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLocaleLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function normalizeObject(source) {
  const normalized = { ...source };
  REQUIRED_STRING_FIELDS.forEach((field) => {
    normalized[field] = normalizeString(source[field]);
  });
  REQUIRED_ARRAY_FIELDS.forEach((field) => {
    normalized[field] = normalizeStringArray(source[field]);
  });
  REQUIRED_BOOLEAN_FIELDS.forEach((field) => {
    normalized[field] = source[field] === true;
  });
  return normalized;
}

function addError(errors, code, message, details = {}) {
  errors.push({ code, message, ...details });
}

function validateSourceObject(source, normalized, index, errors) {
  REQUIRED_STRING_FIELDS.forEach((field) => {
    if (!normalized[field]) {
      addError(
        errors,
        'missing_string_field',
        `Object at index ${index} is missing required field '${field}'.`,
        { index, id: normalized.id, field });
    }
  });

  REQUIRED_ARRAY_FIELDS.forEach((field) => {
    if (!Array.isArray(source[field]) || normalized[field].length === 0) {
      addError(
        errors,
        'missing_array_field',
        `Object '${normalized.id || index}' requires a non-empty '${field}' array.`,
        { index, id: normalized.id, field });
    }
  });

  REQUIRED_BOOLEAN_FIELDS.forEach((field) => {
    if (typeof source[field] !== 'boolean') {
      addError(
        errors,
        'invalid_boolean_field',
        `Object '${normalized.id || index}' requires boolean field '${field}'.`,
        { index, id: normalized.id, field });
    }
  });
}

export function ingestObjectCatalog(rawObjects, options = {}) {
  const errors = [];
  if (!Array.isArray(rawObjects)) {
    addError(
      errors,
      'catalog_not_array',
      'Unity object catalog payload must be an array.');
    return { ok: false, objects: [], errors };
  }

  const objects = rawObjects.map((value, index) => {
    const isObject = value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value);
    if (!isObject) {
      addError(
        errors,
        'invalid_object',
        `Catalog entry at index ${index} must be an object.`,
        { index });
    }

    const source = isObject ? value : {};
    const normalized = normalizeObject(source);
    validateSourceObject(source, normalized, index, errors);
    return normalized;
  });

  const seenIds = new Set();
  objects.forEach((object, index) => {
    if (!object.id) {
      return;
    }

    const key = object.id.toLocaleLowerCase();
    if (seenIds.has(key)) {
      addError(
        errors,
        'duplicate_id',
        `Duplicate Stable ID '${object.id}' in Unity object catalog.`,
        { index, id: object.id, field: 'id' });
      return;
    }
    seenIds.add(key);
  });

  const declaredCount = options.declaredCount;
  if (declaredCount !== undefined && declaredCount !== null) {
    if (!Number.isInteger(declaredCount) || declaredCount < 0) {
      addError(
        errors,
        'invalid_declared_count',
        `Unity candidateCount '${declaredCount}' is not a non-negative integer.`);
    } else if (declaredCount !== objects.length) {
      addError(
        errors,
        'count_mismatch',
        `Unity declared ${declaredCount} objects but sent ${objects.length}.`,
        { declaredCount, actualCount: objects.length });
    }
  }

  return {
    ok: errors.length === 0,
    objects,
    errors
  };
}
