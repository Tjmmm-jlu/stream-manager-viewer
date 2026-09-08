(function () {
  let guidanceChannel = null;
  let activeTrialId = '';

  const originalCreateDataChannel =
    RTCPeerConnection.prototype.createDataChannel;
  RTCPeerConnection.prototype.createDataChannel = function (label, options) {
    const channel = originalCreateDataChannel.call(this, label, options);
    if (label === 'guidance') {
      guidanceChannel = channel;
      channel.addEventListener('open', () => {
        setStatus('已连接，可开始实验', 'ready');
      });
      channel.addEventListener('close', () => {
        setStatus('Unity 步骤通道已断开', 'disconnected');
      });
      channel.addEventListener('message', handleMessage);
    }
    return channel;
  };

  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('startSequenceButton')
      .addEventListener('click', () => {
        activeTrialId = `trial-${Date.now()}`;
        send({
          type: 'start_sequence',
          trialId: activeTrialId,
          mode: document.getElementById('guidanceMode').value
        });
      });

    document.getElementById('previousStepButton')
      .addEventListener('click', () => send({
        type: 'previous_step',
        trialId: activeTrialId
      }));

    document.getElementById('nextStepButton')
      .addEventListener('click', () => send({
        type: 'next_step',
        trialId: activeTrialId
      }));

    document.getElementById('completeSequenceButton')
      .addEventListener('click', () => send({
        type: 'complete_sequence',
        trialId: activeTrialId
      }));
  });

  function send(command) {
    if (!guidanceChannel || guidanceChannel.readyState !== 'open') {
      setStatus('请先连接 Unity 串流', 'error');
      return;
    }

    guidanceChannel.send(JSON.stringify(command));
    setStatus('等待 Unity 确认…', 'pending');
  }

  function handleMessage(event) {
    let response;
    try {
      response = JSON.parse(event.data);
    } catch (_) {
      return;
    }

    if (response.type === 'sequence_state') {
      if (response.sequenceComplete) {
        setStatus('制备流程已完成', 'ready');
        return;
      }

      if (response.stepIndex < 0) {
        setStatus('流程已重置', 'ready');
        return;
      }

      const current = response.stepIndex + 1;
      setStatus(
        `步骤 ${current}/${response.stepCount}：${response.instruction || response.targetName}`,
        'ready');
      return;
    }

    if (response.type === 'sequence_error') {
      setStatus(response.message || '步骤命令执行失败', 'error');
    }
  }

  function setStatus(message, state) {
    const element = document.getElementById('sequenceStatus');
    if (!element) {
      return;
    }

    element.textContent = message;
    element.dataset.state = state;
  }
})();
