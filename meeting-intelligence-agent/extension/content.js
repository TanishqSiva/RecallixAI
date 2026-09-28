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

    let speaker = "Unknown Speaker";
    for (const sel of SPEAKER_SELECTORS) {
      const spkEl = element.querySelector(sel);
      if (spkEl && spkEl.textContent.trim()) {
        speaker = spkEl.textContent.trim();
        break;
      }
    }

    if (speaker === "Unknown Speaker") {
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
      if (speaker !== "Unknown Speaker" && text.startsWith(speaker)) {
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
      speaker: speaker,
      text: text,
      timestamp: new Date().toISOString()
    };

    try {
      await fetch(`${API_BASE_URL}/api/stream/caption`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      updateBadgeStatus(true, text);
    } catch (err) {
      console.warn("[Companion] Failed to push caption chunk to backend:", err);
      updateBadgeStatus(false, "Backend unreachable");
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
  }

  // Floating In-Page Status Chip in Google Meet
  function injectFloatingStatusBadge() {
    if (document.getElementById("meet-intel-companion-chip")) return;

    const chip = document.createElement("div");
    chip.id = "meet-intel-companion-chip";
    chip.innerHTML = `
      <div style="
        position: fixed;
        bottom: 80px;
        left: 20px;
        background: rgba(15, 23, 42, 0.92);
        color: #f8fafc;
        border: 1px solid #334155;
        border-radius: 20px;
        padding: 6px 14px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 11px;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        z-index: 99999;
        backdrop-filter: blur(8px);
      ">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 6px #10b981;" id="chipDot"></span>
        <span id="chipText">Meeting Intel: Streaming Live</span>
        <a href="${API_BASE_URL}/dashboard" target="_blank" style="
          color: #818cf8;
          text-decoration: none;
          font-weight: 700;
          margin-left: 4px;
          border-left: 1px solid #475569;
          padding-left: 8px;
        ">Open Dashboard ↗</a>
      </div>
    `;
    document.body.appendChild(chip);
  }

  function updateBadgeStatus(online, snippet) {
    const dot = document.getElementById("chipDot");
    const txt = document.getElementById("chipText");
    if (dot && txt) {
      if (online) {
        dot.style.background = "#10b981";
        dot.style.boxShadow = "0 0 6px #10b981";
        txt.textContent = "Streaming Live: " + (snippet.length > 25 ? snippet.slice(0, 25) + "..." : snippet);
      } else {
        dot.style.background = "#ef4444";
        dot.style.boxShadow = "none";
        txt.textContent = "Backend Disconnected";
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

  // Start observation when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserving);
  } else {
    startObserving();
  }
})();
