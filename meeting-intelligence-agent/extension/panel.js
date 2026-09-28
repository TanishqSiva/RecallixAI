/**
 * Meeting Intelligence Agent - Side Panel Controller
 * Handles Pre-Meeting Briefing, Live Captions, Interactive Scratchpad,
 * Post-Call LLM Synthesis & Google Calendar Automation.
 */

// Configuration & State
let API_BASE_URL = "http://localhost:8000";
let autoScrollCaptions = true;
let currentMeetingCode = null;
let captionsList = [];
let lastAnalysisResult = null;

// DOM Elements
const elements = {
  // Global
  connectionStatus: document.getElementById("connectionStatus"),
  userIdInput: document.getElementById("userIdInput"),
  attendeeEmailInput: document.getElementById("attendeeEmailInput"),
  tabButtons: document.querySelectorAll(".tab-btn"),
  tabContents: document.querySelectorAll(".tab-content"),
  captionCountBadge: document.getElementById("captionCountBadge"),

  // Tab 1: Prep
  btnRefreshCalendar: document.getElementById("btnRefreshCalendar"),
  upcomingMeetingsContainer: document.getElementById("upcomingMeetingsContainer"),
  btnFetchBriefing: document.getElementById("btnFetchBriefing"),
  briefingLoading: document.getElementById("briefingLoading"),
  briefingResult: document.getElementById("briefingResult"),

  // Tab 2: Live
  btnAutoScroll: document.getElementById("btnAutoScroll"),
  btnClearCaptions: document.getElementById("btnClearCaptions"),
  btnSimulateCaption: document.getElementById("btnSimulateCaption"),
  captionsFeed: document.getElementById("captionsFeed"),
  userScratchpad: document.getElementById("userScratchpad"),
  scratchpadStatus: document.getElementById("scratchpadStatus"),
  btnLoadSampleDemo: document.getElementById("btnLoadSampleDemo"),
  quickTagButtons: document.querySelectorAll(".tag-btn"),

  // Tab 3: Action
  btnWrapCall: document.getElementById("btnWrapCall"),
  wrapLoading: document.getElementById("wrapLoading"),
  analysisContainer: document.getElementById("analysisContainer"),
  retainedDocId: document.getElementById("retainedDocId"),
  analysisSummary: document.getElementById("analysisSummary"),
  analysisPromisesByUs: document.getElementById("analysisPromisesByUs"),
  analysisPromisesByThem: document.getElementById("analysisPromisesByThem"),
  analysisOpenFollowups: document.getElementById("analysisOpenFollowups"),
  analysisDiscrepancies: document.getElementById("analysisDiscrepancies"),
  suggestedDateTag: document.getElementById("suggestedDateTag"),

  // Calendar Follow-up Form
  calTitleInput: document.getElementById("calTitleInput"),
  calDateTimeInput: document.getElementById("calDateTimeInput"),
  calDurationInput: document.getElementById("calDurationInput"),
  calAttendeesInput: document.getElementById("calAttendeesInput"),
  calAgendaInput: document.getElementById("calAgendaInput"),
  btnScheduleCalendar: document.getElementById("btnScheduleCalendar"),
  scheduleSuccessNotice: document.getElementById("scheduleSuccessNotice"),

  // Settings Modal
  btnSettingsToggle: document.getElementById("btnSettingsToggle"),
  settingsModal: document.getElementById("settingsModal"),
  backendUrlInput: document.getElementById("backendUrlInput"),
  btnCloseSettings: document.getElementById("btnCloseSettings"),
  btnSaveSettings: document.getElementById("btnSaveSettings")
};

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  loadSavedSettings();
  setupEventListeners();
  setupScratchpadAutoSave();
  setupMessageListeners();
  
  // Set default calendar date input to tomorrow at 10:00 AM
  setDefaultFollowupDateTime();

  // Check health and sync calendar
  await checkBackendHealth();
  await refreshUpcomingMeetings();

  // Restore stored session
  restoreSessionState();
});

// Setup Tab Navigation
function setupTabs() {
  elements.tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetTabId = btn.getAttribute("data-tab");

      elements.tabButtons.forEach(b => b.classList.remove("active"));
      elements.tabContents.forEach(c => c.classList.remove("active"));

      btn.classList.add("active");
      const targetContent = document.getElementById(targetTabId);
      if (targetContent) targetContent.classList.add("active");
    });
  });
}

function switchTab(tabId) {
  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (btn) btn.click();
}

// Settings & Storage
function loadSavedSettings() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["backendUrl", "userId", "attendeeEmail"], (res) => {
      if (res.backendUrl) {
        API_BASE_URL = res.backendUrl;
        elements.backendUrlInput.value = API_BASE_URL;
      }
      if (res.userId) elements.userIdInput.value = res.userId;
      if (res.attendeeEmail) elements.attendeeEmailInput.value = res.attendeeEmail;
    });
  }
}

function saveSettings() {
  API_BASE_URL = elements.backendUrlInput.value.trim().replace(/\/+$/, "");
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({
      backendUrl: API_BASE_URL,
      userId: elements.userIdInput.value.trim(),
      attendeeEmail: elements.attendeeEmailInput.value.trim()
    });
  }
  elements.settingsModal.style.display = "none";
  checkBackendHealth();
}

// Backend Health Check
async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, { method: "GET" });
    if (res.ok) {
      elements.connectionStatus.className = "status-indicator online";
      elements.connectionStatus.querySelector(".status-text").textContent = "Backend: Connected";
      return true;
    }
  } catch (err) {
    console.warn("Backend not reachable at", API_BASE_URL);
  }
  elements.connectionStatus.className = "status-indicator offline";
  elements.connectionStatus.querySelector(".status-text").textContent = "Backend: Offline";
  return false;
}

// -------------------------------------------------------------
// TAB 1: Upcoming Calendar & Hindsight Memory Recall
// -------------------------------------------------------------
async function refreshUpcomingMeetings() {
  elements.upcomingMeetingsContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div><span>Checking upcoming Google Calendar meetings...</span></div>';
  try {
    const res = await fetch(`${API_BASE_URL}/api/calendar/upcoming?window_minutes=15`);
    const data = await res.json();

    if (data.events && data.events.length > 0) {
      elements.upcomingMeetingsContainer.innerHTML = "";
      data.events.forEach(evt => {
        const card = document.createElement("div");
        card.className = "meeting-card";
        const attendeeStr = (evt.attendees || []).map(a => a.email || a).join(", ");
        
        card.innerHTML = `
          <div class="meeting-title">📅 ${escapeHtml(evt.summary || "Untitled Meeting")}</div>
          <div class="meeting-time">⏰ ${new Date(evt.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(evt.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          <div class="meeting-attendees">👥 ${escapeHtml(attendeeStr || "No external attendees")}</div>
        `;

        card.addEventListener("click", () => {
          // Pre-populate attendee
          if (evt.attendees && evt.attendees.length > 0) {
            const firstExternal = evt.attendees.find(a => (a.email || a) !== elements.userIdInput.value.trim());
            const email = firstExternal ? (firstExternal.email || firstExternal) : (evt.attendees[0].email || evt.attendees[0]);
            elements.attendeeEmailInput.value = email;
            elements.calAttendeesInput.value = email;
          }
          fetchBriefing();
        });

        elements.upcomingMeetingsContainer.appendChild(card);
      });
    } else {
      elements.upcomingMeetingsContainer.innerHTML = `
        <div class="placeholder-text">
          No calendar meetings starting within 15 minutes.<br>
          <small>Enter attendee email manually below to recall Hindsight memories.</small>
        </div>
      `;
    }
  } catch (err) {
    elements.upcomingMeetingsContainer.innerHTML = `
      <div class="placeholder-text" style="color: var(--warning-color);">
        Could not connect to calendar endpoint (${err.message}).<br>
        Using manual attendee entry.
      </div>
    `;
  }
}

async function fetchBriefing() {
  const userId = elements.userIdInput.value.trim() || "default-user";
  const attendeeEmail = elements.attendeeEmailInput.value.trim();

  if (!attendeeEmail) {
    alert("Please specify an Attendee Email to query Hindsight memory.");
    return;
  }

  elements.briefingLoading.style.display = "flex";
  elements.briefingResult.innerHTML = "";

  try {
    const res = await fetch(`${API_BASE_URL}/api/meetings/prep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        attendee_email: attendeeEmail
      })
    });

    const data = await res.json();
    elements.briefingLoading.style.display = "none";

    if (data.briefing) {
      elements.briefingResult.innerHTML = `
        <div class="briefing-content">
          <strong>🧠 Hindsight Context (${escapeHtml(attendeeEmail)}):</strong>
          <div style="margin-top: 6px;">${formatBriefingText(data.briefing)}</div>
        </div>
      `;
    } else {
      elements.briefingResult.innerHTML = `
        <div class="placeholder-text">
          No previous memories recorded for ${escapeHtml(attendeeEmail)} in Hindsight bank.<br>
          Memories will be recorded upon finishing this meeting.
        </div>
      `;
    }
  } catch (err) {
    elements.briefingLoading.style.display = "none";
    elements.briefingResult.innerHTML = `
      <div class="placeholder-text" style="color: var(--danger-color);">
        Error querying Hindsight: ${escapeHtml(err.message)}
      </div>
    `;
  }
}

function formatBriefingText(text) {
  return escapeHtml(text)
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

// -------------------------------------------------------------
// TAB 2: Live Captions & Interactive Scratchpad
// -------------------------------------------------------------
function addCaptionLine(caption) {
  captionsList.push(caption);
  elements.captionCountBadge.textContent = captionsList.length;

  const placeholder = elements.captionsFeed.querySelector(".placeholder-text");
  if (placeholder) placeholder.remove();

  const lineEl = document.createElement("div");
  lineEl.className = "caption-line";
  const timeStr = caption.timestamp ? new Date(caption.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "";

  lineEl.innerHTML = `
    <span class="time">${timeStr}</span>
    <span class="speaker">${escapeHtml(caption.speaker || "Participant")}:</span>
    <span class="text">${escapeHtml(caption.text || "")}</span>
  `;

  elements.captionsFeed.appendChild(lineEl);

  if (autoScrollCaptions) {
    elements.captionsFeed.scrollTop = elements.captionsFeed.scrollHeight;
  }
}

function setupScratchpadAutoSave() {
  let timeout = null;
  elements.userScratchpad.addEventListener("input", () => {
    elements.scratchpadStatus.textContent = "Typing...";
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      const notes = elements.userScratchpad.value;
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ notes: notes });
      }
      try {
        chrome.runtime.sendMessage({ type: "UPDATE_NOTES", notes });
      } catch (e) {}
      elements.scratchpadStatus.textContent = "Saved locally";
    }, 400);
  });
}

function restoreSessionState() {
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: "GET_SESSION_STATE" }, (response) => {
      if (chrome.runtime.lastError || !response) return;

      if (response.notes) {
        elements.userScratchpad.value = response.notes;
      }
      if (response.captions && response.captions.length > 0) {
        elements.captionsFeed.innerHTML = "";
        response.captions.forEach(c => addCaptionLine(c));
      }
      if (response.currentMeetingCode) {
        currentMeetingCode = response.currentMeetingCode;
      }
    });
  }
}

function setupMessageListeners() {
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "LIVE_CAPTION_RECEIVED") {
        addCaptionLine(message.data);
      }
    });
  }
}

// -------------------------------------------------------------
// TAB 3: Wrap Call, Post-Meeting Analysis & Calendar Follow-up
// -------------------------------------------------------------
async function wrapCallAndAnalyze() {
  const userId = elements.userIdInput.value.trim() || "default-user";
  const attendeeEmail = elements.attendeeEmailInput.value.trim() || "attendee@example.com";
  const scratchpadNotes = elements.userScratchpad.value;

  if (captionsList.length === 0 && !scratchpadNotes.trim()) {
    alert("No captions or notes captured yet! Use '+ Mock Line' or 'Load Demo Scenario' to test.");
    return;
  }

  // Build clean transcript
  const transcriptText = captionsList
    .map(c => `${c.speaker || "Participant"}: ${c.text || ""}`)
    .join("\n");

  elements.wrapLoading.style.display = "flex";
  elements.analysisContainer.style.display = "none";

  try {
    const res = await fetch(`${API_BASE_URL}/api/meetings/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        attendee_email: attendeeEmail,
        transcript: transcriptText,
        user_notes: scratchpadNotes,
        meeting_id: currentMeetingCode || `meet-${Date.now()}`
      })
    });

    const data = await res.json();
    elements.wrapLoading.style.display = "none";
    elements.analysisContainer.style.display = "block";

    lastAnalysisResult = data;
    renderAnalysisResults(data, attendeeEmail);
  } catch (err) {
    elements.wrapLoading.style.display = "none";
    alert("Error completing meeting analysis: " + err.message);
  }
}

function renderAnalysisResults(data, attendeeEmail) {
  const analysis = data.analysis || {};
  const hindsightInfo = data.hindsight_retention || {};

  // Hindsight Badge
  elements.retainedDocId.textContent = `Bank: ${hindsightInfo.bank_id || "active"} | Memory Doc ID: ${hindsightInfo.document_id || "doc-" + Date.now()}`;

  // Summary
  elements.analysisSummary.textContent = analysis.summary || "No summary generated.";

  // Promises by Us
  renderList(elements.analysisPromisesByUs, analysis.promises_by_us, "No promises recorded by user.");

  // Promises by Them
  renderList(elements.analysisPromisesByThem, analysis.promises_by_them, "No promises recorded by attendee.");

  // Missed or Open Follow-ups
  renderList(elements.analysisOpenFollowups, analysis.missed_or_pending_followups, "No unresolved items detected.");

  // Scratchpad Discrepancies
  renderList(elements.analysisDiscrepancies, analysis.note_discrepancies, "Scratchpad notes match verbal transcript.");

  // Calendar Followup Pre-population
  elements.calAttendeesInput.value = attendeeEmail;
  if (analysis.suggested_followup_date) {
    elements.suggestedDateTag.textContent = `Agreed Target: ${analysis.suggested_followup_date}`;
    try {
      const dt = new Date(analysis.suggested_followup_date);
      if (!isNaN(dt.getTime())) {
        elements.calDateTimeInput.value = dt.toISOString().slice(0, 16);
      }
    } catch (e) {}
  } else {
    elements.suggestedDateTag.textContent = "Suggested: 3 Days Out";
  }

  // Auto-fill agenda from promises & followups
  const agendaItems = [];
  if (analysis.promises_by_us && analysis.promises_by_us.length > 0) {
    agendaItems.push("User Deliverables: " + analysis.promises_by_us.join("; "));
  }
  if (analysis.promises_by_them && analysis.promises_by_them.length > 0) {
    agendaItems.push("Partner Deliverables: " + analysis.promises_by_them.join("; "));
  }
  if (analysis.missed_or_pending_followups && analysis.missed_or_pending_followups.length > 0) {
    agendaItems.push("Open Questions: " + analysis.missed_or_pending_followups.join("; "));
  }
  elements.calAgendaInput.value = agendaItems.join("\n") || "Follow up on previous meeting commitments and action items.";
}

function renderList(container, items, emptyMessage) {
  container.innerHTML = "";
  if (!items || items.length === 0) {
    container.innerHTML = `<li style="border-left-color: var(--border-color); color: var(--text-muted);">${emptyMessage}</li>`;
    return;
  }
  items.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    container.appendChild(li);
  });
}

// Google Calendar Follow-Up Scheduling
async function scheduleFollowUpEvent() {
  const title = elements.calTitleInput.value.trim() || "Meeting Follow-up";
  const startIso = elements.calDateTimeInput.value;
  const durationMinutes = parseInt(elements.calDurationInput.value, 10) || 30;
  const attendeesRaw = elements.calAttendeesInput.value;
  const agenda = elements.calAgendaInput.value.trim();

  if (!startIso) {
    alert("Please select a date and time for the follow-up meeting.");
    return;
  }

  const attendeesList = attendeesRaw
    .split(",")
    .map(e => e.trim())
    .filter(e => e.length > 0);

  const startDate = new Date(startIso);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  const payload = {
    summary: title,
    description: agenda,
    start_time: startDate.toISOString(),
    end_time: endDate.toISOString(),
    attendees: attendeesList
  };

  elements.btnScheduleCalendar.disabled = true;
  elements.btnScheduleCalendar.textContent = "Scheduling Event in Google Calendar...";

  try {
    const res = await fetch(`${API_BASE_URL}/api/calendar/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    elements.btnScheduleCalendar.disabled = false;
    elements.btnScheduleCalendar.textContent = "📅 Confirm & Schedule Follow-Up Event";

    if (data.status === "confirmed" || data.event) {
      const meetLink = data.meet_link || (data.event && data.event.hangoutLink) || "";
      const htmlLink = data.html_link || (data.event && data.event.htmlLink) || "#";
      
      elements.scheduleSuccessNotice.style.display = "block";
      elements.scheduleSuccessNotice.innerHTML = `
        ✅ <strong>Follow-up Scheduled in Google Calendar!</strong><br>
        ${meetLink ? `<a href="${meetLink}" target="_blank" style="color: #93c5fd;">Join Google Meet</a> | ` : ""}
        <a href="${htmlLink}" target="_blank" style="color: #93c5fd;">Open Event in Calendar ↗</a>
      `;
    } else {
      elements.scheduleSuccessNotice.style.display = "block";
      elements.scheduleSuccessNotice.textContent = "Scheduled (Simulated / Local Mode): " + JSON.stringify(data);
    }
  } catch (err) {
    elements.btnScheduleCalendar.disabled = false;
    elements.btnScheduleCalendar.textContent = "📅 Confirm & Schedule Follow-Up Event";
    alert("Calendar error: " + err.message);
  }
}

// -------------------------------------------------------------
// Interactive Demo & Simulation Helpers
// -------------------------------------------------------------
function loadSampleScenario() {
  elements.attendeeEmailInput.value = "sarah.connor@acme.org";
  elements.calAttendeesInput.value = "sarah.connor@acme.org";

  // Sample User Notes with an intentional discrepancy (user wrote Friday, but spoken was Thursday)
  elements.userScratchpad.value = 
`[Promise: I will deliver the updated enterprise pricing breakdown by Friday afternoon]
[Decision: Agreed to use SSO SAML for user provisioning]
[Action: Sarah needs to send over technical security questionnaire]
Note: Sarah seemed concerned about API rate limits and data retention.`;

  // Sample Captions
  const demoCaptions = [
    { speaker: "Sarah Connor", text: "Thanks for meeting today, Alex. We really like your platform architecture.", timestamp: new Date(Date.now() - 400000).toISOString() },
    { speaker: "Alex", text: "Great to hear, Sarah! I can send over the enterprise pricing sheet by Thursday 5 PM so your team can review before the weekend.", timestamp: new Date(Date.now() - 350000).toISOString() },
    { speaker: "Sarah Connor", text: "Thursday works even better. In return, I will send our standard security compliance questionnaire by tomorrow morning.", timestamp: new Date(Date.now() - 300000).toISOString() },
    { speaker: "Alex", text: "Perfect. Does next Tuesday at 2 PM work for a 30-minute sync to finalize the agreement?", timestamp: new Date(Date.now() - 200000).toISOString() },
    { speaker: "Sarah Connor", text: "Yes, next Tuesday 2 PM is locked in. Let's schedule that.", timestamp: new Date(Date.now() - 100000).toISOString() }
  ];

  elements.captionsFeed.innerHTML = "";
  captionsList = [];
  demoCaptions.forEach(c => addCaptionLine(c));

  // Trigger scratchpad save
  elements.userScratchpad.dispatchEvent(new Event("input"));
}

function simulateRandomCaptionLine() {
  const speakers = ["Sarah Connor", "Alex", "Jordan (Product)", "Elena (Tech Lead)"];
  const quotes = [
    "We definitely need the SSO integration completed before Q4.",
    "I will email the updated contract terms by tomorrow afternoon.",
    "Could you clarify the SLA commitment for 99.9% uptime?",
    "Let's schedule a follow-up demo for the security team next Wednesday at 10 AM.",
    "Agreed, we will proceed with the annual billing tier."
  ];

  const speaker = speakers[Math.floor(Math.random() * speakers.length)];
  const text = quotes[Math.floor(Math.random() * quotes.length)];
  addCaptionLine({
    speaker,
    text,
    timestamp: new Date().toISOString()
  });
}

function setDefaultFollowupDateTime() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 0, 0, 0); // 2:00 PM
  elements.calDateTimeInput.value = tomorrow.toISOString().slice(0, 16);
}

function setupEventListeners() {
  // Prep
  elements.btnRefreshCalendar.addEventListener("click", refreshUpcomingMeetings);
  elements.btnFetchBriefing.addEventListener("click", fetchBriefing);

  // Live
  elements.btnAutoScroll.addEventListener("click", () => {
    autoScrollCaptions = !autoScrollCaptions;
    elements.btnAutoScroll.textContent = `Scroll: ${autoScrollCaptions ? "ON" : "OFF"}`;
  });

  elements.btnClearCaptions.addEventListener("click", () => {
    elements.captionsFeed.innerHTML = '<div class="placeholder-text">Captions cleared.</div>';
    captionsList = [];
    elements.captionCountBadge.textContent = "0";
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "CLEAR_SESSION" });
    }
  });

  elements.btnSimulateCaption.addEventListener("click", simulateRandomCaptionLine);
  elements.btnLoadSampleDemo.addEventListener("click", loadSampleScenario);

  // Quick Tags
  elements.quickTagButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const tag = btn.getAttribute("data-insert");
      const textarea = elements.userScratchpad;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      textarea.value = text.substring(0, start) + tag + text.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + tag.length;
      textarea.focus();
      textarea.dispatchEvent(new Event("input"));
    });
  });

  // Action
  elements.btnWrapCall.addEventListener("click", wrapCallAndAnalyze);
  elements.btnScheduleCalendar.addEventListener("click", scheduleFollowUpEvent);

  // Settings
  elements.btnSettingsToggle.addEventListener("click", () => {
    elements.settingsModal.style.display = "flex";
  });
  elements.btnCloseSettings.addEventListener("click", () => {
    elements.settingsModal.style.display = "none";
  });
  elements.btnSaveSettings.addEventListener("click", saveSettings);
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, function(m) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m];
  });
}
