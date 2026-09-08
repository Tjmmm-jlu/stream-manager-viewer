import { getServerConfig, getRTCConfiguration } from "../../js/config.js";
import { createDisplayStringArray } from "../../js/stats.js";
import { VideoPlayer } from "../../js/videoplayer.js";
import { RenderStreaming } from "../../module/renderstreaming.js";
import { Signaling, WebSocketSignaling } from "../../module/signaling.js";
import { ingestObjectCatalog } from "./object-catalog.js";
import { createSemanticMatchController } from "./semantic-match-ui.js";
import { createCandidateVisualizer } from "./candidate-visualizer.js";

/** @type {Element} */
let playButton;
/** @type {RenderStreaming} */
let renderstreaming;
/** @type {boolean} */
let useWebSocket;
/** @type {WebSocket | null} */
let gazeSocket = null;
/** @type {number | null} */
let gazeReconnectTimer = null;
/** @type {boolean} */
let pageClosing = false;
/** @type {RTCDataChannel | null} */
let gazeDataChannel = null;
/** @type {RTCDataChannel | null} */
let guidanceDataChannel = null;
/** @type {Array<object>} */
let semanticObjectCatalog = [];
let semanticMatchController;
let candidateVisualizer;

const codecPreferences = document.getElementById('codecPreferences');
const guidanceModeSelect = document.getElementById('guidanceMode');
const clearGuidanceButton = document.getElementById('clearGuidanceButton');
const guidanceStatus = document.getElementById('guidanceStatus');
const gazeStatus = document.getElementById('gazeStatus');
const layoutDensityButtons = Array.from(
  document.querySelectorAll('[data-layout-density]'));
const layoutDensityStatus = document.getElementById('layoutDensityStatus');
const trialIdInput = document.getElementById('trialIdInput');
const startSequenceButton = document.getElementById('startSequenceButton');
const resetSequenceButton = document.getElementById('resetSequenceButton');
const recenterExperimentButton = document.getElementById('recenterExperimentButton');
const recenterStatus = document.getElementById('recenterStatus');
const sequenceStatus = document.getElementById('sequenceStatus');
const liquidStatus = document.getElementById('liquidStatus');
const retryLiquidButton = document.getElementById('retryLiquidButton');
const startTrialButton = document.getElementById('startTrialButton');
const semanticObjectSelect = document.getElementById('semanticObjectSelect');
const refreshObjectsButton = document.getElementById('refreshObjectsButton');
const confirmTargetButton = document.getElementById('confirmTargetButton');
const completeTrialButton = document.getElementById('completeTrialButton');
const objectControlStatus = document.getElementById('objectControlStatus');
const supportsSetCodecPreferences = window.RTCRtpTransceiver &&
  'setCodecPreferences' in window.RTCRtpTransceiver.prototype;
const messageDiv = document.getElementById('message');
messageDiv.style.display = 'none';

const playerDiv = document.getElementById('player');
const lockMouseCheck = document.getElementById('lockMouseCheck');
const videoPlayer = new VideoPlayer();

setup();
connectGazeWebSocket();
setupGuidanceControls();
setupObjectControls();
setupSequenceControls();
setupLayoutDensityControls();
setupCandidateVisualization();
setupSemanticMatcher();

window.document.oncontextmenu = function () {
  return false;     // cancel default menu
};

window.addEventListener('resize', function () {
  videoPlayer.resizeVideo();
}, true);

window.addEventListener('beforeunload', async () => {
  pageClosing = true;
  if (gazeSocket) {
    gazeSocket.close();
  }
  if(!renderstreaming)
    return;
  await renderstreaming.stop();
}, true);

function connectGazeWebSocket() {
  if (gazeSocket && (gazeSocket.readyState === WebSocket.OPEN || gazeSocket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  setGazeStatus('正在连接眼动服务…', 'pending');
  gazeSocket = new WebSocket('ws://127.0.0.1:8765/gaze');

  gazeSocket.onopen = () => {
    if (gazeReconnectTimer) {
      clearTimeout(gazeReconnectTimer);
      gazeReconnectTimer = null;
    }
    console.log('Tobii gaze WebSocket connected.');
    setGazeStatus('眼动服务已连接，等待有效数据', 'pending');
  };

  gazeSocket.onmessage = (event) => {
    try {
      const gaze = JSON.parse(event.data);
      const mappedGaze = mapGazeToVideoViewport(gaze);
      semanticMatchController?.setGaze(mappedGaze);
      sendGazeToUnity(mappedGaze);
      setGazeStatus(
        mappedGaze.valid
          ? '眼动数据接收中'
          : '眼动已连接，当前注视不在视频画面',
        mappedGaze.valid ? 'ready' : 'pending');
    } catch (error) {
      console.warn('Ignored malformed gaze message.', error);
    }
  };

  gazeSocket.onerror = () => {
    setGazeStatus('眼动服务连接失败，正在重试…', 'error');
    gazeSocket.close();
  };

  gazeSocket.onclose = () => {
    gazeSocket = null;

    setGazeStatus('眼动服务未连接，正在重试…', 'disconnected');

    if (pageClosing) {
      return;
    }

    // The Python Tobii bridge may be started after the viewer page.
    // Keep retrying so Unity begins receiving gaze as soon as the bridge is available.
    if (!gazeReconnectTimer) {
      gazeReconnectTimer = window.setTimeout(() => {
        gazeReconnectTimer = null;
        connectGazeWebSocket();
      }, 1000);
    }
  };
}

function mapGazeToVideoViewport(gaze) {
  if (!gaze || !gaze.valid) {
    return {
      type: 'gaze',
      valid: false,
      receivedAt: Date.now(),
      timestamp_us: gaze ? gaze.timestamp_us : null,
      pc_time_unix: gaze ? gaze.pc_time_unix : null,
      raw: gaze
    };
  }

  const targetElement = videoPlayer.videoElement || playerDiv;
  const targetRect = targetElement.getBoundingClientRect();

  // Tobii gives display-normalized coordinates. Convert them into browser
  // client pixels by estimating the viewport origin inside the OS window.
  // This is most accurate when the viewer browser is maximized or fullscreen.
  const screenX = gaze.x * window.screen.width;
  const screenY = gaze.y * window.screen.height;
  const borderX = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
  const viewportLeft = window.screenX + borderX;
  const viewportTop = window.screenY + Math.max(0, window.outerHeight - window.innerHeight - borderX);
  const clientX = screenX - viewportLeft;
  const clientY = screenY - viewportTop;

  const videoX = (clientX - targetRect.left) / targetRect.width;
  const videoY = (clientY - targetRect.top) / targetRect.height;
  const insideVideo = videoX >= 0 && videoY >= 0 && videoX <= 1 && videoY <= 1;

  if (!insideVideo) {
    return {
      type: 'gaze',
      valid: false,
      timestamp_us: gaze.timestamp_us,
      pc_time_unix: gaze.pc_time_unix,
      raw: gaze
    };
  }

  return {
    type: 'gaze',
    valid: true,
    receivedAt: Date.now(),
    timestamp_us: gaze.timestamp_us,
    pc_time_unix: gaze.pc_time_unix,
    // Unity viewport coordinates use bottom-left origin, so Y is flipped here.
    x: videoX,
    y: 1 - videoY,
    videoX: videoX,
    videoY: videoY,
    raw: gaze
  };
}

async function setup() {
  const res = await getServerConfig();
  useWebSocket = res.useWebSocket;
  showWarningIfNeeded(res.startupMode);
  showCodecSelect();
  showPlayButton();
}

function showWarningIfNeeded(startupMode) {
  const warningDiv = document.getElementById("warning");
  if (startupMode == "private") {
    warningDiv.innerHTML = "<h4>Warning</h4> This sample is not working on Private Mode.";
    warningDiv.hidden = false;
  }
}

function showPlayButton() {
  if (!document.getElementById('playButton')) {
    const elementPlayButton = document.createElement('img');
    elementPlayButton.id = 'playButton';
    elementPlayButton.src = '../../images/Play.png';
    elementPlayButton.alt = 'Start Streaming';
    playButton = document.getElementById('player').appendChild(elementPlayButton);
    playButton.addEventListener('click', onClickPlayButton);
  }
}

function onClickPlayButton() {
  playButton.style.display = 'none';

  // add video player
  videoPlayer.createPlayer(playerDiv, lockMouseCheck);
  setupRenderStreaming();
}

async function setupRenderStreaming() {
  codecPreferences.disabled = true;

  const signaling = useWebSocket ? new WebSocketSignaling() : new Signaling();
  const config = getRTCConfiguration();
  renderstreaming = new RenderStreaming(signaling, config);
  renderstreaming.onConnect = onConnect;
  renderstreaming.onDisconnect = onDisconnect;
  renderstreaming.onTrackEvent = (data) => videoPlayer.addTrack(data.track);
  renderstreaming.onGotOffer = setCodecPreferences;

  await renderstreaming.start();
  await renderstreaming.createConnection();
}

function onConnect() {
  const inputChannel = renderstreaming.createDataChannel("input");
  videoPlayer.setupInput(inputChannel);

  // Render Streaming 3.1 binds remote channels to the first receiver that is
  // not Open yet. Create them one at a time so input, gaze, and guidance are
  // deterministically assigned to their matching Unity receivers.
  if (inputChannel.readyState === 'open') {
    setupGazeDataChannel();
  } else {
    inputChannel.addEventListener('open', setupGazeDataChannel, { once: true });
  }

  showStatsMessage();
}

function setupGazeDataChannel() {
  if (gazeDataChannel) {
    return;
  }

  // Do not mix JSON gaze packets into the existing "input" channel.
  // Unity's InputReceiver expects binary InputSystem messages there.
  gazeDataChannel = renderstreaming.createDataChannel("gaze");
  gazeDataChannel.addEventListener('open', () => {
    console.log('Gaze DataChannel open.');
    setupGuidanceDataChannel();
  }, { once: true });
  gazeDataChannel.onclose = () => console.log('Gaze DataChannel closed.');

  if (gazeDataChannel.readyState === 'open') {
    setupGuidanceDataChannel();
  }
}

function setupGuidanceControls() {
  guidanceModeSelect.addEventListener('change', () => {
    sendGuidanceCommand({
      type: 'set_guidance_mode',
      mode: guidanceModeSelect.value
    });
  });

  clearGuidanceButton.addEventListener('click', () => {
    resetTargetWorkspace();
    sendGuidanceCommand({
      type: 'clear_guidance'
    });
  });
}

function setupObjectControls() {
  startTrialButton.addEventListener('click', () => {
    resetTargetWorkspace();
    if (!trialIdInput.value.trim()) {
      trialIdInput.value = `trial-${Date.now()}`;
    }
    setObjectControlStatus('正在开始试次…', 'pending');
    sendGuidanceCommand({
      type: 'start_trial',
      trialId: trialIdInput.value.trim(),
      condition: 'database_id_highlight',
      mode: 'highlight'
    });
  });

  refreshObjectsButton.addEventListener('click', requestObjectCatalog);

  semanticObjectSelect.addEventListener('change', () => {
    confirmTargetButton.disabled = !semanticObjectSelect.value;
    candidateVisualizer.setSelectedCandidate(semanticObjectSelect.value);
  });

  confirmTargetButton.addEventListener('click', () => {
    const targetId = semanticObjectSelect.value;
    if (!targetId) {
      setObjectControlStatus('请先选择一个目标物体', 'error');
      return;
    }
    setObjectControlStatus(`正在确认 ${targetId}…`, 'pending');
    sendGuidanceCommand({
      type: 'select_target',
      trialId: trialIdInput.value.trim(),
      targetId: targetId,
      mode: 'highlight'
    });
  });

  completeTrialButton.addEventListener('click', () => {
    resetTargetWorkspace();
    sendGuidanceCommand({
      type: 'complete_trial',
      trialId: trialIdInput.value.trim()
    });
  });
}

function setupSequenceControls() {
  retryLiquidButton.addEventListener('click', () => {
    if (sendGuidanceCommand({ type: 'retry_liquid_stage' })) {
      retryLiquidButton.disabled = true;
    }
  });
  recenterExperimentButton.addEventListener('click', () => {
    setRecenterStatus('正在请求定位…', 'pending');
    const sent = sendGuidanceCommand({ type: 'recenter_experiment' });
    if (!sent) setRecenterStatus('请先连接 Unity 串流', 'disconnected');
  });
  startSequenceButton.addEventListener('click', () => {
    resetTargetWorkspace();
    if (!trialIdInput.value.trim()) {
      trialIdInput.value = `trial-${Date.now()}`;
    }
    setSequenceStatus('正在启动连续任务…', 'pending');
    const sent = sendGuidanceCommand({
      type: 'start_sequence',
      trialId: trialIdInput.value.trim(),
      condition: 'database_id_highlight',
      mode: 'highlight'
    });
    if (!sent) {
      setSequenceStatus('请先连接 Unity 串流', 'disconnected');
    }
  });

  resetSequenceButton.addEventListener('click', () => {
    resetTargetWorkspace();
    setSequenceStatus('正在重置连续任务…', 'pending');
    const sent = sendGuidanceCommand({
      type: 'reset_sequence',
      trialId: trialIdInput.value.trim()
    });
    if (!sent) {
      setSequenceStatus('请先连接 Unity 串流', 'disconnected');
    }
  });
}

function setupLayoutDensityControls() {
  layoutDensityButtons.forEach(button => {
    button.addEventListener('click', () => {
      const density = button.dataset.layoutDensity;
      if (!density) {
        return;
      }

      resetTargetWorkspace();
      setLayoutDensityStatus(`正在切换到 ${density}…`, 'pending');
      setLayoutDensityButtonsDisabled(true);

      const sent = sendGuidanceCommand({
        type: 'set_layout_density',
        density,
        seed: 20260811
      });
      if (!sent) {
        setLayoutDensityStatus('请先连接 Unity 串流', 'disconnected');
        setLayoutDensityButtonsDisabled(false);
      }
    });
  });
}

function setupCandidateVisualization() {
  candidateVisualizer = createCandidateVisualizer({
    player: playerDiv,
    thumbnailRoot: document.getElementById('semanticCandidateBody'),
    getVideoElement: () => videoPlayer.videoElement
  }, {
    sendCommand: sendGuidanceCommand,
    onVisualsUpdated: (visuals) => {
      semanticMatchController?.setCandidateVisuals(visuals);
    },
    onCandidateSelected: (targetId) => {
      semanticMatchController.selectCandidate(targetId);
    }
  });
}

function setupSemanticMatcher() {
  semanticMatchController = createSemanticMatchController({
    form: document.getElementById('semanticMatchForm'),
    input: document.getElementById('semanticQueryInput'),
    submitButton: document.getElementById('matchSemanticButton'),
    status: document.getElementById('semanticMatchStatus'),
    results: document.getElementById('semanticMatchResults'),
    slots: document.getElementById('semanticSlots'),
    preferredId: document.getElementById('semanticPreferredId'),
    candidateTable: document.getElementById('semanticCandidateTable'),
    candidateBody: document.getElementById('semanticCandidateBody'),
    emptyCandidates: document.getElementById('semanticEmptyCandidates'),
    rejectedSection: document.getElementById('semanticRejectedSection'),
    rejectedList: document.getElementById('semanticRejectedList')
  }, {
    onCandidateSelected: selectSemanticObject,
    onMatchResult: (result) => {
      clearSelectedTarget();
      candidateVisualizer.setCandidates(result.candidates);
    },
    onGazeRanking: (result, orderChanged) => {
      if (orderChanged) {
        candidateVisualizer.setCandidates(result.candidates);
      }
    }
  });
}

function clearSelectedTarget() {
  semanticObjectSelect.value = '';
  confirmTargetButton.disabled = true;
  candidateVisualizer.setSelectedCandidate('');
}

function resetTargetWorkspace({ notifyUnity = true } = {}) {
  candidateVisualizer.clear({ notifyUnity });
  semanticMatchController.reset();
  semanticObjectSelect.value = '';
  confirmTargetButton.disabled = true;
}

function selectSemanticObject(targetId) {
  const hasTarget = semanticObjectCatalog.some(object =>
    object.id === targetId);
  if (!hasTarget) {
    return;
  }

  const hasOption = Array.from(semanticObjectSelect.options)
    .some(option => option.value === targetId);
  if (!hasOption) {
    updateSemanticObjectSelect(semanticObjectCatalog);
  }

  semanticObjectSelect.value = targetId;
  confirmTargetButton.disabled = false;
  candidateVisualizer.setSelectedCandidate(targetId);
}

function requestObjectCatalog() {
  setObjectControlStatus('正在读取 Unity 物体目录…', 'pending');
  sendGuidanceCommand({ type: 'get_object_catalog' });
}

function setupGuidanceDataChannel() {
  // Keep the creation order aligned with Unity Broadcast.streams:
  // input, gaze, then guidance.
  guidanceDataChannel = renderstreaming.createDataChannel("guidance");
  guidanceDataChannel.onopen = () => {
    setGuidanceStatus('Unity 已连接，正在应用提示方法…', 'pending');
    sendGuidanceCommand({
      type: 'set_guidance_mode',
      mode: guidanceModeSelect.value
    });
    requestObjectCatalog();
    sendGuidanceCommand({ type: 'get_recenter_state' });
  };
  guidanceDataChannel.onclose = () => {
    candidateVisualizer.clear({ notifyUnity: false });
    setRecenterStatus('定位未连接', 'disconnected');
    setGuidanceStatus('Unity 提示通道已断开', 'disconnected');
  };
  guidanceDataChannel.onmessage = (event) => {
    try {
      const response = JSON.parse(event.data);
      handleGuidanceResponse(response);
    } catch (error) {
      console.warn('Ignored malformed guidance response.', error);
    }
  };
}

function sendGuidanceCommand(command) {
  if (!guidanceDataChannel ||
      guidanceDataChannel.readyState !== 'open') {
    setGuidanceStatus('请先连接 Unity 串流', 'disconnected');
    return false;
  }

  guidanceDataChannel.send(JSON.stringify(command));
  return true;
}

function handleGuidanceResponse(response) {
  if (!response) {
    return;
  }

  const modeLabels = {
    none: '无提示',
    highlight: '物体高亮'
  };
  const label = modeLabels[response.mode] || response.mode || '';

  if (response.type === 'layout_density_applied') {
    const density = response.density || 'unknown';
    if (response.ok) {
      setLayoutDensityStatus(
        `${density}：已生成 ${response.generatedCount ?? 0} 个物体`,
        'ready');
      setLayoutDensitySelected(density);
      setLayoutDensityButtonsDisabled(false);
      requestObjectCatalog();
    } else {
      setLayoutDensityStatus(response.message || '场景密度切换失败', 'error');
      setLayoutDensityButtonsDisabled(false);
    }
    return;
  }

  if (response.type === 'recenter_state') {
    const messages = {
      idle: '等待初始定位',
      waiting: '等待头显定位',
      ready: '已回到初始站位',
      hands_busy: '请先放下手中物体',
      tracking_unavailable: '定位超时，请重试',
      unavailable: '当前场景定位不可用'
    };
    setRecenterStatus(messages[response.message] || '定位失败',
      response.ok ? (response.message === 'waiting' ? 'pending' : 'ready') : 'error');
    recenterExperimentButton.disabled = response.message === 'unavailable';
    return;
  }

  if (response.type === 'sequence_state') {
    resetTargetWorkspace({ notifyUnity: false });
    candidateVisualizer.updatePlacementZones(
      response.placementZoneVisuals || []);
    if (response.sequenceComplete) {
      setSequenceStatus('连续任务已完成', 'ready');
    } else if (response.stepIndex >= 0 && response.stepCount > 0) {
      const target = response.instruction || response.targetName || response.targetId || '当前目标';
      setSequenceStatus(
        `第 ${response.stepIndex + 1}/${response.stepCount} 步：${target}`,
        'ready');
    } else {
      setSequenceStatus('连续任务未开始', 'pending');
    }
    return;
  }

  if (response.type === 'filtration_state') {
    const states = {
      solution_not_ready: '溶解尚未完成', assembly_two_hands: '漏斗和接收烧杯未同时握持',
      align_funnel: '漏斗与接收烧杯口未对齐', receiver_upright: '接收烧杯未直立',
      filter_two_hands: '原烧杯和接收组件未同时握持', filtering: '过滤中',
      filter_missed: '液流偏离滤纸', remove_funnel: '滤液已收集，漏斗待取下',
      transfer_two_hands: '接收烧杯和蒸发皿未同时握持', dish_upright: '蒸发皿未放平',
      transfer_missed: '液流偏离蒸发皿', transferring: '转移滤液中',
      filtrate_lost: '剩余液量不足，可重做当前步骤', filtrate_transferred: '滤液已转入蒸发皿'
    };
    const volume = value => Number.isFinite(value) ? value.toFixed(1) : '--';
    liquidStatus.hidden = false;
    liquidStatus.textContent = `${states[response.message] || response.message} · 原烧杯 ${volume(response.beakerMl)} mL · 接收烧杯 ${volume(response.filtrateMl)} mL · 蒸发皿 ${volume(response.dishMl)} mL · 本步最低接液 ${volume(response.filtrationMinimumMl)} mL · 本次洒漏 ${volume(response.filtrationSpilledMl)} mL`;
    retryLiquidButton.hidden = false;
    retryLiquidButton.disabled = !response.canRetryLiquid;
    return;
  }

  if (response.type === 'liquid_state') {
    const handStates = {
      Measuring: '量水：水源和量筒未同时握持',
      AddingWater: '加水：量筒和装有晶体的烧杯未同时握持',
      Stirring: '搅拌：玻璃棒和烧杯未同时握持'
    };
    const states = {
      idle: '液体操作待开始', two_hands: handStates[response.mixingStage] || '等待双手持物', measuring: '量水',
      hold_cylinder: '量筒未握持', settling: '量水读数稳定中',
      keep_upright: '等待量筒直立', overfilled: '水量超标', adding_water: '向烧杯加水',
      immerse_rod: '玻璃棒未进入液体', stirring: '搅拌中', dissolved: '溶解完成'
    };
    const volume = value => Number.isFinite(value) ? value.toFixed(1) : '--';
    liquidStatus.hidden = false;
    liquidStatus.textContent = `${states[response.message] || response.message} · 量筒 ${volume(response.cylinderMl)} mL · 烧杯 ${volume(response.beakerMl)} mL · 目标 ${volume(response.targetMl)} ± ${volume(response.toleranceMl)} mL · 搅拌 ${Math.round((response.mixingProgress || 0) * 100)}% · 洒漏 ${volume(response.spilledMl)} mL`;
    retryLiquidButton.hidden = false;
    retryLiquidButton.disabled = !response.canRetryLiquid;
    return;
  }

  if (response.type === 'transfer_state') {
    resetTargetWorkspace({ notifyUnity: false });
    const transferMessages = {
      WaitingForPickup: '用镊子夹取粗硫酸铜',
      Carrying: '已夹取粗硫酸铜，请转移到空烧杯开口',
      Completed: '硫酸铜已转移到烧杯'
    };
    setSequenceStatus(transferMessages[response.message] || response.message, 'ready');
    return;
  }

  if (response.type === 'placement_evaluated') {
    setSequenceStatus(
      response.ok
        ? `目标选择正确：${response.targetId || '当前目标'}`
        : (response.message || '放置未通过'),
      response.ok ? 'ready' : 'error');
    return;
  }

  if (response.type === 'sequence_error') {
    setSequenceStatus(response.message || '连续任务操作失败', 'error');
    return;
  }

  if (response.type === 'candidate_visuals') {
    candidateVisualizer.updateVisuals(
      response.ok ? response.candidateVisuals : []);
    candidateVisualizer.updatePlacementZones(
      response.ok ? response.placementZoneVisuals : []);
    if (!response.ok) {
      setObjectControlStatus(
        response.message || 'Unity 无法计算候选位置',
        'error');
    }
    return;
  }

  if (response.type === 'placement_zone_visuals') {
    candidateVisualizer.updatePlacementZones(
      response.ok ? response.placementZoneVisuals : []);
    return;
  }

  if (response.type === 'object_catalog' ||
      response.type === 'object_candidates') {
    const catalogResult = ingestObjectCatalog(response.candidates, {
      declaredCount: response.candidateCount
    });
    if (!response.ok || !catalogResult.ok) {
      const validationMessage = catalogResult.errors.length
        ? catalogResult.errors[0].message
        : response.message || 'Unity 物体目录读取失败';
      console.error('Rejected invalid Unity object catalog.', {
        response,
        errors: catalogResult.errors
      });
      setObjectControlStatus(`物体目录校验失败：${validationMessage}`, 'error');
      return;
    }

    if (response.type === 'object_catalog') {
      semanticObjectCatalog = catalogResult.objects;
    }
    const displayedObjects = response.type === 'object_catalog'
      ? semanticObjectCatalog
      : catalogResult.objects;
    updateSemanticObjectSelect(displayedObjects);
    if (response.type === 'object_catalog') {
      semanticMatchController.setCatalog(semanticObjectCatalog);
    }
    setObjectControlStatus(
      `已加载 ${displayedObjects.length} 个场景物体`,
      'ready');
    return;
  }

  if (response.type === 'guidance_target_shown') {
    setGuidanceStatus(
      `${label}：${response.targetName || '目标'} 已显示`,
      response.ok ? 'ready' : 'error');
    setObjectControlStatus(
      `已确认：${response.targetName || '目标'}`,
      response.ok ? 'ready' : 'error');
    return;
  }

  if (response.type === 'trial_ready') {
    if (response.trialId) {
      trialIdInput.value = response.trialId;
    }
    setObjectControlStatus(
      '新试次已开始',
      response.ok ? 'ready' : 'error');
  }

  if (response.type === 'trial_completed') {
    setObjectControlStatus('试次已完成，日志已保存', 'ready');
    return;
  }

  if (response.type === 'guidance_target_cleared' ||
      response.type === 'guidance_cleared') {
    setGuidanceStatus(`${label}：目标已清除`, 'ready');
    return;
  }

  if (response.type === 'guidance_ready' ||
      response.type === 'guidance_mode_applied' ||
      response.type === 'trial_ready') {
    setGuidanceStatus(
      response.ok ? `${label} 已在 Unity 中生效` : response.message,
      response.ok ? 'ready' : 'error');
    return;
  }

  if (!response.ok || response.type === 'guidance_error') {
    setLayoutDensityButtonsDisabled(false);
    setGuidanceStatus(response.message || 'Unity 提示命令失败', 'error');
    setObjectControlStatus(response.message || 'Unity 命令失败', 'error');
  }
}

function updateSemanticObjectSelect(objects) {
  const previousValue = semanticObjectSelect.value;
  semanticObjectSelect.innerHTML = '';

  if (!objects.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '场景中没有已注册的实验物体';
    semanticObjectSelect.appendChild(option);
    semanticObjectSelect.disabled = true;
    confirmTargetButton.disabled = true;
    return;
  }

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '等待候选选择';
  semanticObjectSelect.appendChild(placeholder);

  objects.forEach((object) => {
    const option = document.createElement('option');
    option.value = object.id;
    const attributes = [object.category, object.color]
      .filter(Boolean)
      .join(' / ');
    option.textContent = `${object.displayName || object.id} (${object.id})` +
      (attributes ? ` — ${attributes}` : '');
    semanticObjectSelect.appendChild(option);
  });

  semanticObjectSelect.disabled = false;
  const previousTargetIsValid = objects.some(
    object => object.id === previousValue);
  semanticObjectSelect.value = previousTargetIsValid ? previousValue : '';
  confirmTargetButton.disabled = !semanticObjectSelect.value;
}

function setGuidanceStatus(message, state) {
  guidanceStatus.textContent = message;
  guidanceStatus.dataset.state = state;
}

function setGazeStatus(message, state) {
  if (!gazeStatus) {
    return;
  }
  gazeStatus.textContent = message;
  gazeStatus.dataset.state = state;
}

function setObjectControlStatus(message, state) {
  objectControlStatus.textContent = message;
  objectControlStatus.dataset.state = state;
}

function setLayoutDensityStatus(message, state) {
  if (!layoutDensityStatus) {
    return;
  }
  layoutDensityStatus.textContent = message;
  layoutDensityStatus.dataset.state = state;
}

function setRecenterStatus(message, state) {
  recenterStatus.textContent = message;
  recenterStatus.dataset.state = state;
  recenterExperimentButton.disabled = state === 'disconnected';
  if (state === 'disconnected') {
    retryLiquidButton.disabled = true;
    liquidStatus.hidden = true;
  }
}

function setSequenceStatus(message, state) {
  if (!sequenceStatus) {
    return;
  }
  sequenceStatus.textContent = message;
  sequenceStatus.title = message;
  sequenceStatus.dataset.state = state;
}

function setLayoutDensitySelected(density) {
  layoutDensityButtons.forEach(button => {
    const selected = button.dataset.layoutDensity === density;
    button.dataset.selected = selected ? 'true' : 'false';
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}

function setLayoutDensityButtonsDisabled(disabled) {
  layoutDensityButtons.forEach(button => {
    button.disabled = disabled;
  });
}

function sendGazeToUnity(gaze) {
  if (!gaze || !gazeDataChannel || gazeDataChannel.readyState !== 'open') {
    return;
  }

  const payload = {
    type: 'gaze',
    valid: gaze.valid,
    timestamp_us: gaze.timestamp_us,
    pc_time_unix: gaze.pc_time_unix
  };

  if (gaze.valid) {
    payload.x = gaze.x;
    payload.y = gaze.y;
    payload.videoX = gaze.videoX;
    payload.videoY = gaze.videoY;
  }

  gazeDataChannel.send(JSON.stringify(payload));
}

async function onDisconnect(connectionId) {
  clearStatsMessage();
  messageDiv.style.display = 'block';
  messageDiv.innerText = `Disconnect peer on ${connectionId}.`;

  await renderstreaming.stop();
  renderstreaming = null;
  gazeDataChannel = null;
  guidanceDataChannel = null;
  candidateVisualizer.clear({ notifyUnity: false });
  semanticObjectCatalog = [];
  semanticMatchController.setCatalog([]);
  setGuidanceStatus('Unity 提示通道已断开', 'disconnected');
  setObjectControlStatus('Unity 提示通道已断开', 'disconnected');
  setRecenterStatus('定位未连接', 'disconnected');
  setLayoutDensityStatus('等待 Unity 串流', 'disconnected');
  setLayoutDensitySelected('');
  setLayoutDensityButtonsDisabled(false);
  videoPlayer.deletePlayer();
  if (supportsSetCodecPreferences) {
    codecPreferences.disabled = false;
  }
  showPlayButton();
}

function setCodecPreferences() {
  /** @type {RTCRtpCodecCapability[] | null} */
  let selectedCodecs = null;
  if (supportsSetCodecPreferences) {
    const preferredCodec = codecPreferences.options[codecPreferences.selectedIndex];
    if (preferredCodec.value !== '') {
      const [mimeType, sdpFmtpLine] = preferredCodec.value.split(' ');
      const { codecs } = RTCRtpSender.getCapabilities('video');
      const selectedCodecIndex = codecs.findIndex(c => c.mimeType === mimeType && c.sdpFmtpLine === sdpFmtpLine);
      const selectCodec = codecs[selectedCodecIndex];
      selectedCodecs = [selectCodec];
    }
  }

  if (selectedCodecs == null) {
    return;
  }
  const transceivers = renderstreaming.getTransceivers().filter(t => t.receiver.track.kind == "video");
  if (transceivers && transceivers.length > 0) {
    transceivers.forEach(t => t.setCodecPreferences(selectedCodecs));
  }
}

function showCodecSelect() {
  if (!supportsSetCodecPreferences) {
    messageDiv.style.display = 'block';
    messageDiv.innerHTML = `Current Browser does not support <a href="https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpTransceiver/setCodecPreferences">RTCRtpTransceiver.setCodecPreferences</a>.`;
    return;
  }

  const codecs = RTCRtpSender.getCapabilities('video').codecs;
  codecs.forEach(codec => {
    if (['video/red', 'video/ulpfec', 'video/rtx'].includes(codec.mimeType)) {
      return;
    }
    const option = document.createElement('option');
    option.value = (codec.mimeType + ' ' + (codec.sdpFmtpLine || '')).trim();
    option.innerText = option.value;
    codecPreferences.appendChild(option);
  });
  codecPreferences.disabled = false;
}

/** @type {RTCStatsReport} */
let lastStats;
/** @type {number} */
let intervalId;

function showStatsMessage() {
  intervalId = setInterval(async () => {
    if (renderstreaming == null) {
      return;
    }

    const stats = await renderstreaming.getStats();
    if (stats == null) {
      return;
    }

    const array = createDisplayStringArray(stats, lastStats);
    if (array.length) {
      messageDiv.style.display = 'block';
      messageDiv.innerHTML = array.join('<br>');
    }
    lastStats = stats;
  }, 1000);
}

function clearStatsMessage() {
  if (intervalId) {
    clearInterval(intervalId);
  }
  lastStats = null;
  intervalId = null;
  messageDiv.style.display = 'none';
  messageDiv.innerHTML = '';
}


