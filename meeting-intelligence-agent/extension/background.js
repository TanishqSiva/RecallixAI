/**
 * Meeting Intelligence Companion - Background Service Worker
 * Manages active Meet tab detection and status badges.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Meeting Intel Companion] Installed successfully.");
});

// Update badge when user enters or leaves a Google Meet tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && tab.url.includes("meet.google.com")) {
    chrome.action.setBadgeText({ text: "LIVE", tabId: tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#10b981", tabId: tabId });
  } else {
    chrome.action.setBadgeText({ text: "", tabId: tabId });
  }
});
