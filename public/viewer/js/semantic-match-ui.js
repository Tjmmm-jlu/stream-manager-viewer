import { matchTranscript } from './object-matcher.js';
import { createManualTranscript } from './transcript.js';
import { rankCandidatesWithGaze } from './gaze-candidate-ranking.js';

const REQUIRED_ELEMENT_KEYS = [
  'form',
  'input',
  'submitButton',
  'status',
  'results',
  'slots',
  'preferredId',
  'candidateTable',
  'candidateBody',
  'emptyCandidates',
  'rejectedSection',
  'rejectedList'
];

const REASON_MESSAGES = {
  empty_transcript: '请输入目标描述',
  empty_catalog: '等待 Unity 物体目录',
  no_semantic_evidence: '没有识别到可匹配的物体属性',
  no_compatible_candidate: '没有物体同时满足全部识别属性',
  transcript_not_final: '语音转写尚未结束'
};

function assertElements(elements) {
  REQUIRED_ELEMENT_KEYS.forEach((key) => {
    if (!elements[key]) {
      throw new Error(`Semantic matcher UI is missing element '${key}'.`);
    }
  });
}

function candidateMatchedFields(candidate) {
  return candidate.matchedFields
    .map(match => match.field)
    .join(', ');
}

function candidateConflictFields(candidate) {
  return candidate.conflicts
    .map(conflict => conflict.field)
    .join(', ');
}

export function createSemanticMatchViewModel(result) {
  const extractedSlots = result && result.extractedSlots
    ? result.extractedSlots
    : {};
  const candidates = result && Array.isArray(result.candidates)
    ? result.candidates
    : [];
  const rejectedCandidates = result && Array.isArray(result.rejectedCandidates)
    ? result.rejectedCandidates
    : [];

  return {
    reason: result ? result.reason : 'empty_transcript',
    slotEntries: Object.entries(extractedSlots)
      .flatMap(([field, values]) => values.map(value => ({ field, value }))),
    candidates: candidates.map(candidate => ({
      id: candidate.id,
      displayName: candidate.displayName || candidate.id,
      score: candidate.score,
      matchedFields: candidateMatchedFields(candidate)
    })),
    rejectedCandidates: rejectedCandidates.map(candidate => ({
      id: candidate.id,
      conflictFields: candidateConflictFields(candidate)
    })),
    preferredId: candidates.length > 0 ? candidates[0].id : ''
  };
}

function appendCell(row, value, className = '') {
  const cell = document.createElement('td');
  cell.textContent = value;
  if (className) {
    cell.className = className;
  }
  row.appendChild(cell);
}

export function createSemanticMatchController(elements, options = {}) {
  assertElements(elements);

  let catalog = [];
  let lastResult = null;
  let manualSequence = 0;
  let selectedCandidateId = '';
  let manualSelection = false;
  let candidateVisuals = [];
  let latestGaze = null;

  function setStatus(message, state) {
    elements.status.textContent = message;
    elements.status.dataset.state = state;
  }

  function selectCandidate(targetId, selectionOptions = {}) {
    const candidateId = typeof targetId === 'string' ? targetId : '';
    if (selectionOptions.manual === true) {
      manualSelection = Boolean(candidateId);
    }
    selectedCandidateId = candidateId;
    elements.candidateBody.querySelectorAll(
      'input[name="semanticMatchCandidate"]')
      .forEach((radio) => {
        radio.checked = radio.value === candidateId;
      });
    elements.candidateBody.querySelectorAll('tr[data-candidate-id]')
      .forEach((row) => {
        row.dataset.selected =
          row.dataset.candidateId === candidateId ? 'true' : 'false';
      });
    elements.preferredId.textContent = candidateId || '-';
    if (candidateId && typeof options.onCandidateSelected === 'function') {
      options.onCandidateSelected(candidateId);
    }
  }

  function renderSlots(slotEntries) {
    elements.slots.replaceChildren();
    if (slotEntries.length === 0) {
      elements.slots.textContent = '-';
      return;
    }

    slotEntries.forEach(({ field, value }) => {
      const slot = document.createElement('span');
      slot.className = 'semantic-slot';
      slot.textContent = `${field}: ${value}`;
      elements.slots.appendChild(slot);
    });
  }

  function renderCandidates(candidates) {
    elements.candidateBody.replaceChildren();
    elements.candidateTable.hidden = candidates.length === 0;
    elements.emptyCandidates.hidden = candidates.length > 0;

    candidates.forEach((candidate, index) => {
      const row = document.createElement('tr');
      row.dataset.candidateId = candidate.id;
      const selectionCell = document.createElement('td');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'semanticMatchCandidate';
      radio.value = candidate.id;
      radio.checked = index === 0;
      radio.setAttribute('aria-label', `选择 ${candidate.displayName}`);
      selectionCell.appendChild(radio);
      row.appendChild(selectionCell);
      appendCell(row, String(index + 1), 'semantic-rank');

      const thumbnailCell = document.createElement('td');
      thumbnailCell.className = 'semantic-thumbnail-cell';
      const thumbnailFrame = document.createElement('div');
      thumbnailFrame.className = 'semantic-thumbnail-frame';
      thumbnailFrame.tabIndex = 0;
      thumbnailFrame.setAttribute('role', 'button');
      thumbnailFrame.setAttribute(
        'aria-label', `选择画面中的 ${candidate.displayName}`);
      const thumbnail = document.createElement('canvas');
      thumbnail.className = 'semantic-candidate-thumbnail';
      thumbnail.width = 160;
      thumbnail.height = 90;
      thumbnail.dataset.candidateId = candidate.id;
      const thumbnailStatus = document.createElement('span');
      thumbnailStatus.className = 'semantic-thumbnail-status';
      thumbnailStatus.dataset.thumbnailStatus = '';
      thumbnailStatus.textContent = '等待候选位置';
      thumbnailFrame.append(thumbnail, thumbnailStatus);
      thumbnailCell.appendChild(thumbnailFrame);
      row.appendChild(thumbnailCell);

      appendCell(row, candidate.displayName, 'semantic-candidate-name');
      row.addEventListener('click', (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement ||
            target.closest('.semantic-thumbnail-frame')) {
          return;
        }
        selectCandidate(candidate.id, { manual: true });
      });
      elements.candidateBody.appendChild(row);
    });
  }

  function renderRejected(rejectedCandidates) {
    elements.rejectedList.replaceChildren();
    elements.rejectedSection.hidden = rejectedCandidates.length === 0;
    rejectedCandidates.slice(0, 8).forEach((candidate) => {
      const item = document.createElement('li');
      const id = document.createElement('code');
      id.textContent = candidate.id;
      item.appendChild(id);
      item.append(`：冲突字段 ${candidate.conflictFields || '-'}`);
      elements.rejectedList.appendChild(item);
    });
  }

  function renderResult(result) {
    const viewModel = createSemanticMatchViewModel(result);
    candidateVisuals = [];
    selectedCandidateId = '';
    manualSelection = false;
    elements.results.hidden = false;
    renderSlots(viewModel.slotEntries);
    renderCandidates(viewModel.candidates);
    renderRejected(viewModel.rejectedCandidates);
    if (typeof options.onMatchResult === 'function') {
      options.onMatchResult(result);
    }
    selectCandidate(viewModel.preferredId);

    if (viewModel.candidates.length > 0) {
      setStatus(`找到 ${viewModel.candidates.length} 个候选`, 'ready');
      return;
    }

    const message = REASON_MESSAGES[viewModel.reason] || '没有匹配结果';
    elements.emptyCandidates.textContent = message;
    setStatus(message, 'error');
  }

  function applyGazeRanking() {
    if (!lastResult || !Array.isArray(lastResult.candidates) ||
        lastResult.candidates.length < 2) {
      return;
    }

    const previousIds = lastResult.candidates.map(candidate => candidate.id);
    const ranking = rankCandidatesWithGaze(
      lastResult.candidates,
      candidateVisuals,
      latestGaze);
    const nextIds = ranking.candidates.map(candidate => candidate.id);
    const orderChanged = previousIds.some((id, index) => id !== nextIds[index]);

    lastResult = {
      ...lastResult,
      candidates: ranking.candidates,
      gazeRanking: ranking
    };

    if (orderChanged) {
      renderCandidates(ranking.candidates);
      renderRejected(lastResult.rejectedCandidates || []);
      const nextSelection = manualSelection &&
        ranking.candidates.some(candidate =>
          candidate.id === selectedCandidateId)
        ? selectedCandidateId
        : ranking.candidates[0]?.id || '';
      selectCandidate(nextSelection);
    }

    if (typeof options.onGazeRanking === 'function') {
      options.onGazeRanking(lastResult, orderChanged);
    }

    if (ranking.active) {
      setStatus(
        `找到 ${ranking.candidates.length} 个候选，已结合眼动排序`,
        'ready');
    }
  }

  function runMatch() {
    const text = elements.input.value.trim();
    if (!text) {
      setStatus(REASON_MESSAGES.empty_transcript, 'error');
      elements.input.focus();
      return null;
    }
    if (catalog.length === 0) {
      setStatus(REASON_MESSAGES.empty_catalog, 'pending');
      return null;
    }

    manualSequence += 1;
    const transcript = createManualTranscript(text, {
      utteranceId: `manual-${Date.now()}-${manualSequence}`
    });
    lastResult = matchTranscript(transcript, catalog);
    renderResult(lastResult);
    return lastResult;
  }

  function resetView({ clearInput = true } = {}) {
    lastResult = null;
    selectedCandidateId = '';
    manualSelection = false;
    candidateVisuals = [];
    latestGaze = null;
    if (clearInput) {
      elements.input.value = '';
    }
    elements.results.hidden = true;
    elements.candidateBody.replaceChildren();
    elements.slots.replaceChildren();
    elements.slots.textContent = '-';
    elements.preferredId.textContent = '-';
    elements.rejectedList.replaceChildren();
    elements.rejectedSection.hidden = true;
    selectCandidate('');
    setStatus(
      catalog.length > 0
        ? `已载入 ${catalog.length} 个物体`
        : REASON_MESSAGES.empty_catalog,
      catalog.length > 0 ? 'ready' : 'pending');
  }

  elements.form.addEventListener('submit', (event) => {
    event.preventDefault();
    runMatch();
  });

  elements.candidateBody.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement &&
        target.name === 'semanticMatchCandidate') {
      selectCandidate(target.value, { manual: true });
    }
  });

  elements.submitButton.disabled = true;

  return {
    setCatalog(objects) {
      catalog = Array.isArray(objects) ? [...objects] : [];
      elements.submitButton.disabled = catalog.length === 0;
      if (catalog.length === 0) {
        resetView({ clearInput: false });
        return;
      }

      setStatus(`已载入 ${catalog.length} 个物体`, 'ready');
      if (elements.input.value.trim()) {
        runMatch();
      }
    },
    reset: resetView,
    selectCandidate(targetId) {
      selectCandidate(targetId, { manual: true });
    },
    setGaze(gaze) {
      latestGaze = gaze || null;
      applyGazeRanking();
    },
    setCandidateVisuals(visuals) {
      candidateVisuals = Array.isArray(visuals) ? visuals : [];
      applyGazeRanking();
    },
    runMatch,
    getLastResult() {
      return lastResult;
    }
  };
}
