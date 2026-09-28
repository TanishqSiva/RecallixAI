/**
 * Lightweight Companion Extension Popup Controller
 * Opens the central Web Application Dashboard and provides status.
 */

let API_URL = "http://localhost:8000";

document.addEventListener("DOMContentLoaded", () => {
  const btnOpenDashboard = document.getElementById("btnOpenDashboard");
  const btnToggleSettings = document.getElementById("btnToggleSettings");
  const settingsPanel = document.getElementById("settingsPanel");
  const backendUrlInput = document.getElementById("backendUrl");
  const btnSaveSettings = document.getElementById("btnSaveSettings");
  const companionDot = document.getElementById("companionDot");
  const companionStatus = document.getElementById("companionStatus");
  const companionMeetStatus = document.getElementById("companionMeetStatus");

  // Load saved backend URL
  chrome.storage.local.get(["backendUrl"], (res) => {
    if (res.backendUrl) {
      API_URL = res.backendUrl;
      backendUrlInput.value = API_URL;
    }
    checkBackendHealth();
  });

  // Check if current tab is Google Meet
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].url && tabs[0].url.includes("meet.google.com")) {
      companionMeetStatus.textContent = "🟢 Active Google Meet tab detected! Streaming captions.";
    } else {
      companionMeetStatus.textContent = "Open any Google Meet call to stream captions live.";
    }
  });

  // Open central dashboard
  btnOpenDashboard.addEventListener("click", () => {
    chrome.tabs.create({ url: `${API_URL}/dashboard` });
  });

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
      checkBackendHealth();
    });
  });

  async function checkBackendHealth() {
    try {
      const res = await fetch(`${API_URL}/api/health`);
      if (res.ok) {
        companionDot.style.background = "#10b981";
        companionDot.style.boxShadow = "0 0 6px #10b981";
        companionStatus.textContent = "Backend Connected";
        return;
      }
    } catch (e) {}
    companionDot.style.background = "#ef4444";
    companionDot.style.boxShadow = "none";
    companionStatus.textContent = "Backend Offline";
  }
});
