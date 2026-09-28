/**
 * Google Meet Ingestion Companion Content Script
 * Zero-bot client-side Closed Caption Observer.
 * Directly streams formatted dialogue to the backend ingestion endpoint.
 */

(() => {
  console.log("[Meeting Intel Companion] Initialized on Google Meet.");

  let API_BASE_URL = "http://localhost:8000";

  // Load configured backend URL from storage if set
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["backendUrl"], (res) => {
      if (res.backendUrl) {
        API_BASE_URL = res.backendUrl.replace(/\/+$/, "");
      }
    });
  }

  function getMeetingId() {
    const path = window.location.pathname.replace(/^\/+/, "");
    const parts = path.split("/");
    return parts[0] || "meet-unknown";
  }

  let lastCaptionText = "";
  let lastSpeaker = "";
  let isListening = false;
  let captionObserver = null;
  let capturedSentences = 0;

  // Selectors for Google Meet closed captions containers
  const CAPTION_CONTAINERS = [
    'div[jsname="YSvyTc"]',
    'div[aria-live="polite"]',
    'div[jscontroller="D1tHje"]',
    'div[role="region"][aria-label*="Captions" i]',
    '.a4bIc',
    '.T4LgNb'
  ];

  const SPEAKER_SELECTORS = [
    '.zs7lae',
    '.jxFHg',
    '[data-sender-name]',
    '.VbkSUe'
  ];

  function extractSpeakerAndText(element) {
    if (!element) return null;

    let speaker = "Speaker";
    for (const sel of SPEAKER_SELECTORS) {
      const spkEl = element.querySelector(sel);
      if (spkEl && spkEl.textContent.trim()) {
        speaker = spkEl.textContent.trim();
        break;
      }
    }

    if (speaker === "Speaker") {
      const parent = element.closest('div[jscontroller="D1tHje"], .a4bIc');
      if (parent) {
        for (const sel of SPEAKER_SELECTORS) {
          const spkEl = parent.querySelector(sel);
          if (spkEl && spkEl.textContent.trim()) {
            speaker = spkEl.textContent.trim();
            break;
          }
        }
      }
    }

    let text = "";
    const texts = [];
    element.querySelectorAll('span:not(.zs7lae):not(.jxFHg)').forEach(span => {
      const t = span.textContent.trim();
      if (t && !texts.includes(t)) {
        texts.push(t);
      }
    });
    text = texts.join(" ");

    if (!text) {
      text = element.textContent.trim();
      if (speaker !== "Speaker" && text.startsWith(speaker)) {
        text = text.substring(speaker.length).trim();
      }
    }

    text = text.replace(/\s+/g, " ").trim();
    return { speaker, text };
  }

  async function pushCaptionToBackend(speaker, text) {
    const meetingId = getMeetingId();
    const payload = {
      meeting_id: meetingId,
      speaker: speaker || "Participant",
      text: text,
      timestamp: new Date().toISOString()
    };

    try {
      await fetch(`${API_BASE_URL}/api/stream/caption`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      updateBadgeStatus(true, text, speaker);
    } catch (err) {
      console.warn("[Companion] Failed to push caption chunk to backend:", err);
      updateBadgeStatus(false, "Backend unreachable", null);
    }
  }

  function handleCaptionMutation(mutations) {
    for (const mutation of mutations) {
      const target = mutation.target;
      if (!target || !target.textContent) continue;

      const parsed = extractSpeakerAndText(target.parentElement || target);
      if (!parsed || !parsed.text || parsed.text.length < 2) continue;

      if (parsed.text === lastCaptionText && parsed.speaker === lastSpeaker) {
        continue;
      }

      if (parsed.speaker === lastSpeaker && parsed.text.startsWith(lastCaptionText) && parsed.text.length > lastCaptionText.length) {
        lastCaptionText = parsed.text;
      } else {
        lastCaptionText = parsed.text;
        lastSpeaker = parsed.speaker;
      }

      pushCaptionToBackend(parsed.speaker, parsed.text);
    }
  }

  function checkCcStateInMeet() {
    const ccButtons = Array.from(document.querySelectorAll('button[aria-label*="caption" i], button[data-tooltip*="caption" i], button[jsname="r8qRAd"]'));
    for (const btn of ccButtons) {
      const label = (btn.getAttribute('aria-label') || btn.getAttribute('data-tooltip') || "").toLowerCase();
      const pressed = btn.getAttribute('aria-pressed');
      if (label.includes("turn off captions") || pressed === "true") {
        return { isCaptionsOn: true, button: btn };
      }
      if (label.includes("turn on captions") || pressed === "false") {
        return { isCaptionsOn: false, button: btn };
      }
    }
    // Check if any captions container is actively visible
    for (const sel of CAPTION_CONTAINERS) {
      if (document.querySelector(sel)) {
        return { isCaptionsOn: true, button: null };
      }
    }
    return { isCaptionsOn: false, button: ccButtons[0] || null };
  }

  function startObserving() {
    if (isListening) return;

    captionObserver = new MutationObserver((mutations) => {
      for (const sel of CAPTION_CONTAINERS) {
        const container = document.querySelector(sel);
        if (container && !container.__observed) {
          container.__observed = true;
          const specific = new MutationObserver(handleCaptionMutation);
          specific.observe(container, {
            childList: true,
            subtree: true,
            characterData: true
          });
        }
      }
      handleCaptionMutation(mutations);
    });

    captionObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    isListening = true;
    console.log("[Companion] Live caption observation started.");
    injectFloatingStatusBadge();

    // Check CC state every 2 seconds to keep badge 100% accurate
    setInterval(() => {
      injectFloatingStatusBadge();
      const state = checkCcStateInMeet();
      const ccOffAlert = document.getElementById("meet-ai-cc-off-alert");
      const ccOnIndicator = document.getElementById("meet-ai-cc-on-indicator");
      if (ccOffAlert && ccOnIndicator) {
        if (state.isCaptionsOn) {
          ccOffAlert.style.display = "none";
          ccOnIndicator.style.display = "inline-flex";
        } else {
          ccOffAlert.style.display = "inline-flex";
          ccOnIndicator.style.display = "none";
        }
      }
    }, 2000);
  }

  // Floating In-Page Status Chip in Google Meet
  function injectFloatingStatusBadge() {
    if (document.getElementById("meet-intel-companion-chip")) return;

    const chip = document.createElement("div");
    chip.id = "meet-intel-companion-chip";
    chip.innerHTML = `
      <div style="
        position: fixed;
        bottom: 85px;
        left: 20px;
        background: rgba(11, 17, 32, 0.95);
        color: #f8fafc;
        border: 2px solid #3b82f6;
        border-radius: 18px;
        padding: 8px 14px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.6);
        z-index: 999999;
        backdrop-filter: blur(12px);
        transition: all 0.3s ease;
      " id="chipContainer">
        <!-- Live Dot -->
        <span style="width: 10px; height: 10px; border-radius: 50%; background: #10b981; box-shadow: 0 0 10px #10b981;" id="chipDot"></span>
        
        <!-- On Indicator -->
        <span id="meet-ai-cc-on-indicator" style="display: inline-flex; align-items: center; gap: 4px;">
          <strong style="color: #4ade80;">⚡ Meeting AI: Listening</strong>
          <span id="chipCounter" style="color: #94a3b8; font-size: 11px;">(${capturedSentences} heard)</span>
        </span>

        <!-- Off Alert -->
        <span id="meet-ai-cc-off-alert" style="display: none; align-items: center; gap: 6px; color: #fbbf24;">
          ⚠️ <strong>Captions OFF</strong>
          <button id="btnTurnOnCcDirect" style="
            background: #f59e0b;
            color: #000;
            border: none;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 8px;
            cursor: pointer;
          ">👉 Turn on CC</button>
        </span>

        <!-- Test Speech Button -->
        <button id="btnTestMeetLine" style="
          background: #334155;
          color: #e2e8f0;
          border: 1px solid #475569;
          border-radius: 10px;
          font-size: 10px;
          padding: 2px 8px;
          cursor: pointer;
        " title="Click to test speech ingestion">🧪 Test</button>

        <!-- Open Dashboard Link -->
        <a href="${API_BASE_URL}/dashboard" target="_blank" style="
          color: #818cf8;
          text-decoration: none;
          font-weight: 700;
          font-size: 11px;
          border-left: 1px solid #334155;
          padding-left: 8px;
        ">Dashboard ↗</a>
      </div>
    `;
    document.body.appendChild(chip);

    // Click handler for turning on CC
    const btnTurnOnCcDirect = document.getElementById("btnTurnOnCcDirect");
    if (btnTurnOnCcDirect) {
      btnTurnOnCcDirect.addEventListener("click", () => {
        const state = checkCcStateInMeet();
        if (state.button) {
          state.button.click();
        } else {
          alert("Please click the [CC] button in Google Meet's bottom control bar!");
        }
      });
    }

    // Click handler for test line
    const btnTestMeetLine = document.getElementById("btnTestMeetLine");
    if (btnTestMeetLine) {
      btnTestMeetLine.addEventListener("click", () => {
        pushCaptionToBackend("You (Meet Test)", "Testing Meeting AI - Audio captions verified live inside call!");
      });
    }
  }

  function updateBadgeStatus(online, snippet, speaker) {
    const dot = document.getElementById("chipDot");
    const container = document.getElementById("chipContainer");
    const counter = document.getElementById("chipCounter");

    if (dot && container) {
      if (online) {
        capturedSentences++;
        if (counter) counter.textContent = `(${capturedSentences} heard)`;
        dot.style.background = "#10b981";
        dot.style.boxShadow = "0 0 14px #10b981";

        container.style.borderColor = "#10b981";
        container.style.boxShadow = "0 0 20px rgba(16, 185, 129, 0.5)";
        setTimeout(() => {
          if (container) {
            container.style.borderColor = "#3b82f6";
            container.style.boxShadow = "0 8px 24px rgba(0,0,0,0.6)";
          }
        }, 1800);
      } else {
        dot.style.background = "#ef4444";
        dot.style.boxShadow = "none";
      }
    }
  }

  // Disconnect/Wrap signal when leaving the call
  window.addEventListener("beforeunload", () => {
    const meetingId = getMeetingId();
    if (meetingId && meetingId !== "meet-unknown") {
      try {
        const url = `${API_BASE_URL}/api/stream/end?meeting_id=${encodeURIComponent(meetingId)}`;
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url);
        } else {
          fetch(url, { method: "POST", keepalive: true });
        }
      } catch (e) {}
    }
  });

  // Start observation immediately
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      injectFloatingStatusBadge();
      startObserving();
    });
  } else {
    injectFloatingStatusBadge();
    startObserving();
  }
})();
