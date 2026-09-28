/**
 * Enhanced Visual Companion Popup Controller
 * Real-time status reporting so any user/kid knows 100% whether the agent is listening.
 */

let API_URL = "http://localhost:8000";

document.addEventListener("DOMContentLoaded", () => {
  const btnOpenDashboard = document.getElementById("btnOpenDashboard");
  const btnOpenMeet = document.getElementById("btnOpenMeet");
  const btnTestVoice = document.getElementById("btnTestVoice");
  const testFeedback = document.getElementById("testFeedback");
  const btnToggleSettings = document.getElementById("btnToggleSettings");
  const settingsPanel = document.getElementById("settingsPanel");
  const backendUrlInput = document.getElementById("backendUrl");
  const btnSaveSettings = document.getElementById("btnSaveSettings");

  const overallBanner = document.getElementById("overallBanner");
  const overallDot = document.getElementById("overallDot");
  const overallBannerText = document.getElementById("overallBannerText");

  const serverDot = document.getElementById("serverDot");
  const serverStatusText = document.getElementById("serverStatusText");
  const meetDot = document.getElementById("meetDot");
  const meetStatusText = document.getElementById("meetStatusText");
  const captionSentenceCount = document.getElementById("captionSentenceCount");
  const recentCaptionTicker = document.getElementById("recentCaptionTicker");

  // Load saved backend URL
  chrome.storage.local.get(["backendUrl"], (res) => {
    if (res.backendUrl) {
      API_URL = res.backendUrl;
      backendUrlInput.value = API_URL;
    }
    checkStatus();
  });

  // Poll status every 2 seconds while popup is open
  const pollInterval = setInterval(checkStatus, 2000);
  window.addEventListener("unload", () => clearInterval(pollInterval));

  // Open central dashboard in a new tab
  btnOpenDashboard.addEventListener("click", () => {
    chrome.tabs.create({ url: `${API_URL}/dashboard` });
  });

  // Open Google Meet in a new tab
  if (btnOpenMeet) {
    btnOpenMeet.addEventListener("click", () => {
      chrome.tabs.create({ url: "https://meet.google.com/new" });
    });
  }

  // 1-Click Verification Test
  if (btnTestVoice) {
    btnTestVoice.addEventListener("click", async () => {
      btnTestVoice.disabled = true;
      btnTestVoice.textContent = "⏳ Sending Test Speech...";
      try {
        const testPayload = {
          meeting_id: "live-meeting",
          speaker: "Host (Mic Test)",
          text: "Testing Meeting AI - Microphone and speech ingestion are working 100%!"
        };
        const res = await fetch(`${API_URL}/api/stream/caption`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(testPayload)
        });

        if (res.ok) {
          testFeedback.style.display = "block";
          testFeedback.style.color = "#34d399";
          testFeedback.style.borderColor = "rgba(16, 185, 129, 0.4)";
          testFeedback.style.background = "rgba(16, 185, 129, 0.15)";
          testFeedback.innerHTML = "🎉 <strong>Speech stream is WORKING!</strong> Speech was ingested into Live Studio.";
          await checkStatus();
        } else {
          testFeedback.style.display = "block";
          testFeedback.style.color = "#fbbf24";
          testFeedback.innerHTML = "⚠️ Backend responded with error. Check terminal.";
        }
      } catch (err) {
        testFeedback.style.display = "block";
        testFeedback.style.color = "#f87171";
        testFeedback.innerHTML = "❌ Could not reach backend: " + err.message;
      } finally {
        btnTestVoice.disabled = false;
        btnTestVoice.textContent = "🧪 Test Voice Stream (1-Click Test)";
      }
    });
  }

  // Toggle settings
  btnToggleSettings.addEventListener("click", () => {
    const isHidden = settingsPanel.style.display === "none" || !settingsPanel.style.display;
    settingsPanel.style.display = isHidden ? "block" : "none";
  });

  // Save settings
  btnSaveSettings.addEventListener("click", () => {
    API_URL = backendUrlInput.value.trim().replace(/\/+$/, "");
    chrome.storage.local.set({ backendUrl: API_URL }, () => {
      settingsPanel.style.display = "none";
      checkStatus();
    });
  });

  async function checkStatus() {
    let serverOk = false;
    let meetFound = false;

    // 1. Check Backend Server Health
    try {
      const res = await fetch(`${API_URL}/api/health`);
      if (res.ok) {
        serverOk = true;
        serverDot.className = "dot dot-green";
        serverStatusText.textContent = "Connected (Ready)";
      } else {
        serverDot.className = "dot dot-yellow";
        serverStatusText.textContent = "Server Error";
      }
    } catch (e) {
      serverDot.className = "dot dot-red";
      serverStatusText.textContent = "Offline (Run Server)";
    }

    // 2. Check if current active tab or any tab has Google Meet
    chrome.tabs.query({}, (tabs) => {
      const meetTab = tabs.find(t => t.url && t.url.includes("meet.google.com"));
      if (meetTab) {
        meetFound = true;
        meetDot.className = "dot dot-green";
        meetStatusText.textContent = "Active Call Found";
      } else {
        meetDot.className = "dot dot-yellow";
        meetStatusText.textContent = "Not in Meet";
      }

      // Update Overall Banner
      if (serverOk && meetFound) {
        overallBanner.style.borderColor = "rgba(16, 185, 129, 0.5)";
        overallBanner.style.color = "#34d399";
        overallDot.className = "dot dot-green";
        overallBannerText.textContent = "🟢 READY & LISTENING TO MEET!";
      } else if (serverOk && !meetFound) {
        overallBanner.style.borderColor = "rgba(245, 158, 11, 0.4)";
        overallBanner.style.color = "#fbbf24";
        overallDot.className = "dot dot-yellow";
        overallBannerText.textContent = "🟡 Server Ready (Join Meet & Turn on [CC])";
      } else {
        overallBanner.style.borderColor = "rgba(239, 68, 68, 0.4)";
        overallBanner.style.color = "#f87171";
        overallDot.className = "dot dot-red";
        overallBannerText.textContent = "🔴 Backend Server Offline on Port 8000";
      }
    });

    // 3. Check Active Ingestion Stream for Live Captions
    try {
      const sessionRes = await fetch(`${API_URL}/api/stream/active`);
      if (sessionRes.ok) {
        const session = await sessionRes.json();
        const captions = session.captions || [];
        captionSentenceCount.textContent = `${captions.length} sentence${captions.length === 1 ? '' : 's'}`;

        if (captions.length > 0) {
          const last = captions[captions.length - 1];
          recentCaptionTicker.innerHTML = `<strong style="color:#4ade80;">${escapeHtml(last.speaker || 'Speaker')}:</strong> "${escapeHtml(last.text)}"`;
          recentCaptionTicker.style.borderColor = "#10b981";
        } else {
          recentCaptionTicker.textContent = "Waiting for speech from Google Meet... (Turn ON [CC] in call)";
          recentCaptionTicker.style.borderColor = "#334155";
        }
      }
    } catch (err) {
      // Ignore poll error
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
});
