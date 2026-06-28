(function () {
  const supportedTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
  const instances = new Map();

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  function getSupportedMimeType() {
    if (!window.MediaRecorder) return "";
    return supportedTypes.find(type => MediaRecorder.isTypeSupported(type)) || "";
  }

  function mimeToExtension(mimeType) {
    const cleanType = String(mimeType || "").split(";")[0].toLowerCase();
    const map = {
      "audio/webm": ".webm",
      "audio/mp4": ".m4a",
      "audio/ogg": ".ogg",
      "audio/mpeg": ".mp3",
      "audio/wav": ".wav",
      "audio/x-wav": ".wav"
    };
    return map[cleanType] || ".webm";
  }

  function showInlineError(root, message) {
    const error = root.querySelector(".voice-error");
    if (!error) return;
    error.textContent = message;
    error.hidden = false;
    window.setTimeout(() => { error.hidden = true; }, 4500);
  }

  function ensureStyles() {
    if (document.getElementById("voiceMessagingStyles")) return;
    const style = document.createElement("style");
    style.id = "voiceMessagingStyles";
    style.textContent = `
      .voice-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0 0}
      .voice-round-btn{width:42px;height:42px;border-radius:50%;border:0;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;background:#eef2ff;color:#2563eb;transition:.18s ease;flex:0 0 auto}
      .voice-round-btn:hover{background:#dbeafe;transform:translateY(-1px)}
      .voice-round-btn.recording{background:#fee2e2;color:#dc2626;animation:voicePulse 1.2s infinite}
      .voice-round-btn.send{background:#2563eb;color:#fff}
      .voice-round-btn.cancel{background:#f1f5f9;color:#64748b}
      .voice-round-btn:disabled{opacity:.55;cursor:not-allowed;transform:none}
      .voice-status{display:flex;align-items:center;gap:8px;min-height:32px;color:#475569;font-size:13px;font-weight:600}
      .voice-dot{width:8px;height:8px;border-radius:50%;background:#dc2626;box-shadow:0 0 0 4px rgba(220,38,38,.12)}
      .voice-preview{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:1px solid #dbeafe;border-radius:12px;background:#f8fbff}
      .voice-preview audio{height:34px;flex:1;min-width:0}
      .voice-progress{height:5px;width:min(120px,100%);background:#e2e8f0;border-radius:999px;overflow:hidden}
      .voice-progress span{display:block;height:100%;width:0;background:#2563eb;transition:width .15s ease}
      .voice-error{width:100%;font-size:13px;color:#b91c1c;background:#fee2e2;border:1px solid #fecaca;border-radius:10px;padding:8px 10px}
      .voice-bubble{min-width:0;width:min(320px,100%);max-width:100%}
      .voice-bubble-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px;font-size:12px;opacity:.82}
      .voice-player{display:flex;align-items:center;gap:10px}
      .voice-play-btn{width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.9);color:#1d4ed8;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 auto}
      .message-incoming .voice-play-btn,.message.received .voice-play-btn{background:#e0f2fe;color:#0369a1}
      .voice-seek{appearance:none;width:clamp(90px,28vw,150px);height:5px;border-radius:999px;background:rgba(15,23,42,.18);outline:none}
      .voice-seek::-webkit-slider-thumb{appearance:none;width:13px;height:13px;border-radius:50%;background:#2563eb;cursor:pointer}
      .voice-time{font-size:12px;font-weight:700;white-space:nowrap;opacity:.8}
      @keyframes voicePulse{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.28)}50%{box-shadow:0 0 0 8px rgba(220,38,38,0)}}
      @media(max-width:640px){.voice-bubble{width:min(260px,100%)}.voice-seek{width:clamp(82px,32vw,110px)}.voice-preview audio{min-width:0}}
    `;
    document.head.appendChild(style);
  }

  function createToolbar(instance) {
    const root = document.createElement("div");
    root.className = "voice-toolbar";
    root.innerHTML = `
      <button type="button" class="voice-round-btn voice-record" title="Start recording" aria-label="Start voice recording"><i class="fas fa-microphone"></i></button>
      <div class="voice-status" hidden><span class="voice-dot"></span><span class="voice-timer">0:00</span><span>Recording</span></div>
      <button type="button" class="voice-round-btn voice-stop" title="Stop recording" aria-label="Stop recording" hidden><i class="fas fa-stop"></i></button>
      <button type="button" class="voice-round-btn cancel voice-cancel" title="Cancel recording" aria-label="Cancel recording" hidden><i class="fas fa-times"></i></button>
      <div class="voice-preview" hidden>
        <audio controls preload="metadata"></audio>
        <button type="button" class="voice-round-btn send voice-send" title="Send voice message" aria-label="Send voice message"><i class="fas fa-paper-plane"></i></button>
      </div>
      <div class="voice-progress" hidden><span></span></div>
      <div class="voice-error" hidden></div>
    `;

    root.querySelector(".voice-record").addEventListener("click", () => startRecording(instance));
    root.querySelector(".voice-stop").addEventListener("click", () => stopRecording(instance));
    root.querySelector(".voice-cancel").addEventListener("click", () => resetRecorder(instance));
    root.querySelector(".voice-send").addEventListener("click", () => sendVoice(instance));
    return root;
  }

  async function startRecording(instance) {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      showInlineError(instance.root, "Voice recording is not supported in this browser.");
      return;
    }

    const mimeType = getSupportedMimeType();
    if (!mimeType) {
      showInlineError(instance.root, "This browser cannot record webm, mp4, or ogg audio.");
      return;
    }

    try {
      resetRecorder(instance, { keepError: true });
      instance.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
      });
      instance.chunks = [];
      instance.mimeType = mimeType;
      instance.startedAt = Date.now();
      instance.recorder = new MediaRecorder(instance.stream, { mimeType, audioBitsPerSecond: 64000 });
      instance.recorder.addEventListener("dataavailable", event => {
        if (event.data && event.data.size > 0) instance.chunks.push(event.data);
      });
      instance.recorder.addEventListener("stop", () => buildPreview(instance), { once: true });
      instance.recorder.start(250);
      setRecordingUi(instance, true);
      instance.timer = window.setInterval(() => updateTimer(instance), 250);
      updateTimer(instance);
    } catch (err) {
      const denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
      showInlineError(instance.root, denied ? "Microphone permission was denied. Please allow microphone access and try again." : "Could not start microphone recording.");
      cleanupStream(instance);
    }
  }

  function stopRecording(instance) {
    if (instance.recorder && instance.recorder.state !== "inactive") {
      instance.recorder.stop();
    }
    setRecordingUi(instance, false);
    cleanupStream(instance);
  }

  function buildPreview(instance) {
    if (!instance.chunks.length) {
      resetRecorder(instance);
      return;
    }
    instance.duration = Math.max(1, Math.round((Date.now() - instance.startedAt) / 1000));
    instance.blob = new Blob(instance.chunks, { type: instance.mimeType || "audio/webm" });
    if (instance.previewUrl) URL.revokeObjectURL(instance.previewUrl);
    instance.previewUrl = URL.createObjectURL(instance.blob);
    const preview = instance.root.querySelector(".voice-preview");
    const audio = preview.querySelector("audio");
    audio.src = instance.previewUrl;
    preview.hidden = false;
  }

  function setRecordingUi(instance, isRecording) {
    instance.root.querySelector(".voice-record").hidden = isRecording;
    instance.root.querySelector(".voice-record").classList.toggle("recording", isRecording);
    instance.root.querySelector(".voice-stop").hidden = !isRecording;
    instance.root.querySelector(".voice-cancel").hidden = !isRecording;
    instance.root.querySelector(".voice-status").hidden = !isRecording;
    if (isRecording) instance.root.querySelector(".voice-preview").hidden = true;
  }

  function updateTimer(instance) {
    const elapsed = (Date.now() - instance.startedAt) / 1000;
    instance.root.querySelector(".voice-timer").textContent = formatDuration(elapsed);
  }

  function cleanupStream(instance) {
    if (instance.timer) window.clearInterval(instance.timer);
    instance.timer = null;
    if (instance.stream) {
      instance.stream.getTracks().forEach(track => track.stop());
      instance.stream = null;
    }
  }

  function resetRecorder(instance, options = {}) {
    cleanupStream(instance);
    if (instance.recorder && instance.recorder.state !== "inactive") {
      try { instance.recorder.stop(); } catch (err) {}
    }
    instance.recorder = null;
    instance.chunks = [];
    instance.blob = null;
    instance.duration = 0;
    if (instance.previewUrl) URL.revokeObjectURL(instance.previewUrl);
    instance.previewUrl = null;
    setRecordingUi(instance, false);
    instance.root.querySelector(".voice-preview").hidden = true;
    instance.root.querySelector(".voice-preview audio").removeAttribute("src");
    setProgress(instance, 0, true);
    if (!options.keepError) instance.root.querySelector(".voice-error").hidden = true;
  }

  function setProgress(instance, percent, hidden) {
    const progress = instance.root.querySelector(".voice-progress");
    progress.hidden = !!hidden;
    progress.querySelector("span").style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }

  function sendVoice(instance) {
    const chatId = instance.getChatId();
    if (!chatId || !instance.blob) {
      showInlineError(instance.root, "Open a chat and record audio before sending.");
      return;
    }
    if (instance.isSending) return;
    instance.isSending = true;

    const formData = new FormData();
    const extension = mimeToExtension(instance.blob.type);
    formData.append("voice", instance.blob, `voice-message${extension}`);
    formData.append("duration", String(instance.duration || 0));
    const replyId = instance.getReplyId?.();
    if (replyId) formData.append("replyTo", replyId);

    const xhr = new XMLHttpRequest();
    const sendButton = instance.root.querySelector(".voice-send");
    sendButton.disabled = true;
    setProgress(instance, 2, false);

    xhr.upload.addEventListener("progress", event => {
      if (event.lengthComputable) setProgress(instance, (event.loaded / event.total) * 100, false);
    });

    xhr.addEventListener("load", () => {
      instance.isSending = false;
      sendButton.disabled = false;
      try {
        const data = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
          instance.onSent?.(data.message);
          resetRecorder(instance);
        } else {
          showInlineError(instance.root, data.message || "Could not send voice message.");
          setProgress(instance, 0, true);
        }
      } catch (err) {
        showInlineError(instance.root, "Could not send voice message.");
        setProgress(instance, 0, true);
      }
    });

    xhr.addEventListener("error", () => {
      instance.isSending = false;
      sendButton.disabled = false;
      showInlineError(instance.root, "Network error while uploading voice message.");
      setProgress(instance, 0, true);
    });

    xhr.open("POST", `/api/chat/${encodeURIComponent(chatId)}/message`);
    xhr.withCredentials = true;
    xhr.send(formData);
  }

  function renderVoiceMessage(message, isMine, senderName) {
    const voice = message.voice || {};
    const id = escapeHtml(message._id || `voice-${Date.now()}`);
    const url = escapeHtml(voice.url || "");
    const duration = formatDuration(voice.duration || 0);
    const name = escapeHtml(senderName || (isMine ? "You" : "Voice message"));

    return `
      <div class="voice-bubble" data-voice-id="${id}">
        <div class="voice-bubble-head">
          <span><i class="fas fa-microphone"></i> ${name}</span>
          <span>${duration}</span>
        </div>
        <div class="voice-player">
          <button type="button" class="voice-play-btn" onclick="VoiceMessaging.togglePlayback('${id}')" aria-label="Play voice message">
            <i class="fas fa-play"></i>
          </button>
          <input class="voice-seek" type="range" min="0" max="100" value="0" step="1" oninput="VoiceMessaging.seek('${id}', this.value)">
          <span class="voice-time" data-current>0:00</span>
          <audio preload="none" data-src="${url}" ontimeupdate="VoiceMessaging.sync('${id}')" onloadedmetadata="VoiceMessaging.sync('${id}')" onended="VoiceMessaging.ended('${id}')"></audio>
        </div>
      </div>`;
  }

  function getVoiceElement(id) {
    const safeId = window.CSS?.escape ? CSS.escape(String(id)) : String(id).replace(/"/g, '\\"');
    return document.querySelector(`[data-voice-id="${safeId}"]`);
  }

  function togglePlayback(id) {
    const wrap = getVoiceElement(id);
    if (!wrap) return;
    const audio = wrap.querySelector("audio");
    const icon = wrap.querySelector(".voice-play-btn i");
    if (!audio.src && audio.dataset.src) audio.src = audio.dataset.src;
    document.querySelectorAll(".voice-bubble audio").forEach(other => {
      if (other !== audio) {
        other.pause();
        const otherIcon = other.closest(".voice-bubble")?.querySelector(".voice-play-btn i");
        if (otherIcon) otherIcon.className = "fas fa-play";
      }
    });
    if (audio.paused) {
      audio.play().then(() => { icon.className = "fas fa-pause"; }).catch(() => {});
    } else {
      audio.pause();
      icon.className = "fas fa-play";
    }
  }

  function seek(id, value) {
    const wrap = getVoiceElement(id);
    if (!wrap) return;
    const audio = wrap.querySelector("audio");
    if (!audio.duration) return;
    audio.currentTime = (Number(value) / 100) * audio.duration;
  }

  function sync(id) {
    const wrap = getVoiceElement(id);
    if (!wrap) return;
    const audio = wrap.querySelector("audio");
    const seekBar = wrap.querySelector(".voice-seek");
    const current = wrap.querySelector("[data-current]");
    if (audio.duration) seekBar.value = String((audio.currentTime / audio.duration) * 100);
    if (current) current.textContent = formatDuration(audio.currentTime);
  }

  function ended(id) {
    const wrap = getVoiceElement(id);
    if (!wrap) return;
    const icon = wrap.querySelector(".voice-play-btn i");
    const seekBar = wrap.querySelector(".voice-seek");
    if (icon) icon.className = "fas fa-play";
    if (seekBar) seekBar.value = "0";
  }

  function init(options) {
    ensureStyles();
    const key = options.key || options.role || "default";
    if (instances.has(key)) return instances.get(key);
    const anchor = document.querySelector(options.wrapperSelector || ".message-input-wrapper") || document.querySelector(options.inputSelector || "#messageInput")?.parentElement;
    if (!anchor) return null;
    const instance = {
      ...options,
      getChatId: options.getChatId || (() => null),
      getReplyId: options.getReplyId || (() => null)
    };
    instance.root = createToolbar(instance);
    anchor.insertAdjacentElement("afterend", instance.root);
    instances.set(key, instance);
    return instance;
  }

  window.VoiceMessaging = {
    init,
    renderVoiceMessage,
    togglePlayback,
    seek,
    sync,
    ended,
    formatDuration,
    escapeHtml
  };
})();



