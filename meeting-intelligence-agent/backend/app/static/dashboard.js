/**
 * Meeting Intelligence Agent - Central Web Application Dashboard
 * 3 Main Navigation Sections:
 * 1. Meeting Schedule (Schedule, Pre-Call Briefing & Follow-up Calendar Booking)
 * 2. Live Speech & AI Summary (Live Google Meet captions stream, scratchpad, Gemini analysis & n8n Sheets sync)
 * 3. Clients & Memories (Client directory, past meetings history, and full extension transcripts)
 */

const API_BASE = ""; // Same origin (FastAPI host)
let activeMeetingId = "live-meeting";
let activeAttendeeEmail = "";
let selectedClientObj = null;
let streamPollingTimer = null;
let currentSessionData = null;
let clientsListCache = [];

// DOM Elements - 3 Views
const views = {
  schedule: document.getElementById("view-schedule"),
  studio: document.getElementById("view-studio"),
  clients: document.getElementById("view-clients")
};

const navItems = document.querySelectorAll(".nav-item");
const currentViewTitle = document.getElementById("currentViewTitle");
const currentViewSubtitle = document.getElementById("currentViewSubtitle");

// View 1 Elements (Schedule & Booking)
const todayMeetingsList = document.getElementById("todayMeetingsList");
const briefingContactName = document.getElementById("briefingContactName");
const briefingLoading = document.getElementById("briefingLoading");
const briefingContent = document.getElementById("briefingContent");
const btnRefreshCalendar = document.getElementById("btnRefreshCalendar");
const btnLaunchCallWithBrief = document.getElementById("btnLaunchCallWithBrief");
const followupAttendeeName = document.getElementById("followupAttendeeName");
const followupSuggestedDate = document.getElementById("followupSuggestedDate");
const followupTitle = document.getElementById("followupTitle");
const followupDateTime = document.getElementById("followupDateTime");
const followupAttendees = document.getElementById("followupAttendees");
const followupDuration = document.getElementById("followupDuration");
const followupAgenda = document.getElementById("followupAgenda");
const btnConfirmSchedule = document.getElementById("btnConfirmSchedule");
const calendarSuccessBox = document.getElementById("calendarSuccessBox");

// View 2 Elements (Live Speech & AI Summary)
const studioMeetingTitle = document.getElementById("studioMeetingTitle");
const studioMeetingId = document.getElementById("studioMeetingId");
const studioClientSelector = document.getElementById("studioClientSelector");
const dialogueFeed = document.getElementById("dialogueFeed");
const captionCount = document.getElementById("captionCount");
const studioScratchpad = document.getElementById("studioScratchpad");
const scratchpadSaveStatus = document.getElementById("scratchpadSaveStatus");
const btnStudioWrapMeeting = document.getElementById("btnStudioWrapMeeting");
const btnSimulateDialogue = document.getElementById("btnSimulateDialogue");
const btnClearDialogue = document.getElementById("btnClearDialogue");
const btnClearNotes = document.getElementById("btnClearNotes");

// Merged AI Intelligence Results Elements inside View 2
const intelLoadingState = document.getElementById("intelLoadingState");
const intelMainContent = document.getElementById("intelMainContent");
const hindsightMemoryDetails = document.getElementById("hindsightMemoryDetails");
const intelSummary = document.getElementById("intelSummary");
const intelPromisesUs = document.getElementById("intelPromisesUs");
const intelPromisesThem = document.getElementById("intelPromisesThem");
const intelOpenFollowups = document.getElementById("intelOpenFollowups");
const intelDiscrepancies = document.getElementById("intelDiscrepancies");

// View 3 Elements (Clients)
const clientsContainer = document.getElementById("clientsContainer");
const clientSearchInput = document.getElementById("clientSearchInput");
const clientAvatar = document.getElementById("clientAvatar");
const clientName = document.getElementById("clientName");
const clientEmail = document.getElementById("clientEmail");
const clientCompany = document.getElementById("clientCompany");
const clientMeetingCountPill = document.getElementById("clientMeetingCountPill");
const btnStartMeetingWithClient = document.getElementById("btnStartMeetingWithClient");
const btnClientTargetName = document.getElementById("btnClientTargetName");
const clientMeetingsList = document.getElementById("clientMeetingsList");
const btnOpenAddClientModal = document.getElementById("btnOpenAddClientModal");

// Add Client Modal Elements
const addClientModal = document.getElementById("addClientModal");
const btnCloseAddClientModal = document.getElementById("btnCloseAddClientModal");
const btnCancelAddClient = document.getElementById("btnCancelAddClient");
const btnSaveClient = document.getElementById("btnSaveClient");
const modalClientName = document.getElementById("modalClientName");
const modalClientEmail = document.getElementById("modalClientEmail");
const modalClientCompany = document.getElementById("modalClientCompany");
const modalClientPhone = document.getElementById("modalClientPhone");
const modalClientNotes = document.getElementById("modalClientNotes");

// Initialize on DOM Load
document.addEventListener("DOMContentLoaded", async () => {
  setupNavigation();
  setupScratchpadAutoSave();
  setupEventListeners();
  setDefaultFollowupDate();

  // Load initial data
  await loadTodaySchedule();
  await loadClientsList();
  await syncActiveMeetingStream();

  // Start polling active stream
  startStreamPolling();
});

// Navigation Handling
function setupNavigation() {
  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const viewKey = item.getAttribute("data-view").replace("view-", "");
      switchView(viewKey);
    });
  });

  const btnLaunchStudioDirect = document.getElementById("btnLaunchStudioDirect");
  if (btnLaunchStudioDirect) {
    btnLaunchStudioDirect.addEventListener("click", () => switchView("studio"));
  }
}

function switchView(viewName) {
  navItems.forEach(b => b.classList.remove("active"));
  Object.values(views).forEach(v => {
    if (v) v.classList.remove("active");
  });

  const targetNav = document.querySelector(`.nav-item[data-view="view-${viewName}"]`);
  const targetView = views[viewName];

  if (targetNav) targetNav.classList.add("active");
  if (targetView) targetView.classList.add("active");

  const titles = {
    schedule: { title: "📅 1. Meeting Schedule & Booking", sub: "Upcoming calls, pre-meeting memory recall, and 1-click Google Calendar booking" },
    studio: { title: "🎙️ 2. Live Speech & AI Summary", sub: "Real-time Google Meet captions, scratchpad, Gemini commitments, and Google Sheets sync" },
    clients: { title: "👥 3. Clients & Memories", sub: "Manage client dossiers, past meetings, and full extension transcripts" }
  };

  if (titles[viewName]) {
    currentViewTitle.textContent = titles[viewName].title;
    currentViewSubtitle.textContent = titles[viewName].sub;
  }
}

// -------------------------------------------------------------
// VIEW 1: Meeting Schedule & Calendar Booking
// -------------------------------------------------------------
async function loadTodaySchedule() {
  try {
    const res = await fetch(`${API_BASE}/api/calendar/today`);
    const data = await res.json();
    todayMeetingsList.innerHTML = "";

    if (data.events && data.events.length > 0) {
      data.events.forEach((evt, idx) => {
        const item = document.createElement("div");
        item.className = `schedule-item ${idx === 0 ? "selected" : ""}`;
        
        const startTime = new Date(evt.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endTime = new Date(evt.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const extAttendee = (evt.attendees || []).find(a => (a.email || a) !== "alex@example.com");
        const attendeeEmail = extAttendee ? (extAttendee.email || extAttendee) : "colleague@example.com";
        const attendeeName = extAttendee ? (extAttendee.displayName || attendeeEmail) : "Colleague";

        item.innerHTML = `
          <div class="item-top">
            <span class="item-title">${escapeHtml(evt.summary || "Project Discussion")}</span>
            <span class="item-time">${startTime} - ${endTime}</span>
          </div>
          <div class="item-bottom">
            <span class="item-attendee">👤 ${escapeHtml(attendeeName)} (${escapeHtml(attendeeEmail)})</span>
          </div>
        `;

        item.addEventListener("click", () => {
          document.querySelectorAll(".schedule-item").forEach(i => i.classList.remove("selected"));
          item.classList.add("selected");
          loadPreCallBriefing(attendeeEmail, attendeeName);
        });

        todayMeetingsList.appendChild(item);
      });

      // Auto-load first event briefing
      const first = data.events[0];
      const ext = (first.attendees || []).find(a => (a.email || a) !== "alex@example.com");
      const firstEmail = ext ? (ext.email || ext) : "colleague@example.com";
      const firstName = ext ? (ext.displayName || firstEmail) : "Colleague";
      loadPreCallBriefing(firstEmail, firstName);

    } else {
      todayMeetingsList.innerHTML = `<div style="color: var(--text-muted); padding: 20px; text-align: center;">No calendar events scheduled for today.</div>`;
      briefingContent.textContent = "No meeting selected.";
    }
  } catch (err) {
    todayMeetingsList.innerHTML = `<div style="color: var(--danger); padding: 20px;">Error syncing calendar: ${err.message}</div>`;
  }
}

async function loadPreCallBriefing(email, name) {
  briefingContactName.textContent = `${name} (${email})`;
  activeAttendeeEmail = email;
  briefingLoading.style.display = "flex";
  briefingContent.style.display = "none";

  try {
    const res = await fetch(`${API_BASE}/api/meetings/prep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: "alex@example.com",
        attendee_email: email
      })
    });
    const data = await res.json();
    briefingLoading.style.display = "none";
    briefingContent.style.display = "block";
    briefingContent.innerHTML = escapeHtml(data.briefing || "No past commitments found in Hindsight Bank.");
  } catch (err) {
    briefingLoading.style.display = "none";
    briefingContent.style.display = "block";
    briefingContent.textContent = "Error recalling briefing: " + err.message;
  }
}

// -------------------------------------------------------------
// VIEW 2: Live Speech & AI Summary (Merged)
// -------------------------------------------------------------
async function syncActiveMeetingStream() {
  try {
    const res = await fetch(`${API_BASE}/api/stream/active`);
    if (!res.ok) return;
    const session = await res.json();
    if (!session) return;

    activeMeetingId = session.meeting_id || "live-meeting";
    studioMeetingTitle.textContent = session.title || "Live Meeting Studio";
    studioMeetingId.textContent = session.meeting_id || "Active Session";
    studioScratchpad.value = session.user_notes || "";
    renderDialogueCaptions(session.captions || []);
  } catch (err) {
    console.warn("Could not sync active stream:", err);
  }
}

function renderDialogueCaptions(captions) {
  captionCount.textContent = `${captions.length} utterances`;
  dialogueFeed.innerHTML = "";

  if (captions.length === 0) {
    dialogueFeed.innerHTML = `
      <div class="empty-feed-hint">
        <div style="font-size: 36px; margin-bottom: 8px;">🎙️</div>
        <strong style="font-size: 15px; color: #fff;">Waiting for speech from Google Meet...</strong>
        <p style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">
          Turn on <strong>[CC]</strong> in Google Meet, or click <strong style="color: #818cf8;">"✨ Speak Sample Line"</strong> above to test!
        </p>
      </div>
    `;
    return;
  }

  captions.forEach(c => {
    const el = document.createElement("div");
    const spk = (c.speaker || "Speaker").trim();
    const isHost = spk.toLowerCase().includes("alex") || spk.toLowerCase().includes("host") || spk.toLowerCase().includes("you");
    el.className = `utterance caption-item ${isHost ? 'host' : 'guest'}`;
    const timeStr = c.timestamp ? new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "";

    el.innerHTML = `
      <div class="utterance-header">
        <span class="speaker-tag caption-speaker ${isHost ? 'host' : 'guest'}">${isHost ? '👤' : '👥'} ${escapeHtml(spk)}:</span>
        <span class="time-tag">${timeStr}</span>
      </div>
      <div class="utterance-text caption-text">${escapeHtml(c.text || "")}</div>
    `;
    dialogueFeed.appendChild(el);
  });

  dialogueFeed.scrollTop = dialogueFeed.scrollHeight;
}

function startStreamPolling() {
  if (streamPollingTimer) clearInterval(streamPollingTimer);
  streamPollingTimer = setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stream/session/${activeMeetingId}`);
      if (res.ok) {
        const session = await res.json();
        if (!currentSessionData || (session.captions && session.captions.length !== currentSessionData.captions.length)) {
          renderDialogueCaptions(session.captions || []);
          currentSessionData = session;
        }
      }
    } catch (e) {}
  }, 2500);
}

function setupScratchpadAutoSave() {
  let timeout = null;
  studioScratchpad.addEventListener("input", () => {
    scratchpadSaveStatus.textContent = "● Saving notes to backend...";
    clearTimeout(timeout);
    timeout = setTimeout(async () => {
      const notes = studioScratchpad.value;
      try {
        await fetch(`${API_BASE}/api/stream/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meeting_id: activeMeetingId,
            user_notes: notes
          })
        });
        scratchpadSaveStatus.textContent = "● Synced with backend";
      } catch (err) {
        scratchpadSaveStatus.textContent = "⚠️ Error syncing notes";
      }
    }, 500);
  });
}

// Wrap Call & Generate Post-Call AI Summary inside View 2
async function wrapCallAndAnalyze() {
  switchView("studio");
  intelLoadingState.style.display = "flex";
  intelMainContent.style.display = "none";

  const notes = studioScratchpad.value;
  const transcriptText = (currentSessionData && currentSessionData.captions && currentSessionData.captions.length > 0)
    ? currentSessionData.captions.map(c => `${c.speaker}: ${c.text}`).join("\n")
    : (notes ? `Meeting notes:\n${notes}` : "General project sync and action items review.");

  const targetEmail = activeAttendeeEmail || "attendee@example.com";

  try {
    const res = await fetch(`${API_BASE}/api/meetings/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: "alex@example.com",
        attendee_email: targetEmail,
        transcript: transcriptText,
        user_notes: notes,
        meeting_id: activeMeetingId
      })
    });

    const data = await res.json();
    intelLoadingState.style.display = "none";
    intelMainContent.style.display = "block";
    renderIntelligenceResults(data);

    // Reload clients list so meeting count and history update
    await loadClientsList();

    // Smooth scroll down to AI Summary block
    setTimeout(() => {
      intelMainContent.scrollIntoView({ behavior: "smooth" });
    }, 400);

  } catch (err) {
    intelLoadingState.style.display = "none";
    alert("Error during meeting synthesis: " + err.message);
  }
}

function renderIntelligenceResults(data) {
  const analysis = data.analysis || {};
  const hindsightInfo = data.hindsight_retention || {};

  hindsightMemoryDetails.innerHTML = `Bank: ${hindsightInfo.bank_id || "bank_alex_example_com"} | Document: ${hindsightInfo.document_id || "meet_123"}<br><span style="color: #4ade80; font-size: 0.8rem;">📊 Action items automatically synced to Google Sheets via n8n</span>`;
  intelSummary.textContent = analysis.summary || "Meeting completed successfully.";

  renderList(intelPromisesUs, analysis.promises_by_us, "No promises recorded for user.");
  renderList(intelPromisesThem, analysis.promises_by_them, "No promises recorded for client.");
  renderList(intelOpenFollowups, analysis.missed_or_pending_followups, "No open items detected.");
  renderList(intelDiscrepancies, analysis.note_discrepancies, "Scratchpad notes match spoken dialogue.");

  // Pre-fill schedule form in View 1 as well
  followupAttendeeName.textContent = activeAttendeeEmail;
  followupAttendees.value = activeAttendeeEmail;
  if (analysis.suggested_followup_date) {
    followupSuggestedDate.textContent = `Agreed Target Date: ${analysis.suggested_followup_date}`;
    try {
      const dt = new Date(analysis.suggested_followup_date);
      if (!isNaN(dt.getTime())) {
        followupDateTime.value = dt.toISOString().slice(0, 16);
      }
    } catch (e) {}
  } else {
    followupSuggestedDate.textContent = "Suggested: 3 Days Out";
  }

  const agendaItems = [];
  if (analysis.promises_by_us && analysis.promises_by_us.length > 0) {
    agendaItems.push("User Deliverables: " + analysis.promises_by_us.join("; "));
  }
  if (analysis.promises_by_them && analysis.promises_by_them.length > 0) {
    agendaItems.push("Partner Deliverables: " + analysis.promises_by_them.join("; "));
  }
  if (analysis.missed_or_pending_followups && analysis.missed_or_pending_followups.length > 0) {
    agendaItems.push("Unresolved Items: " + analysis.missed_or_pending_followups.join("; "));
  }
  followupAgenda.value = agendaItems.join("\n") || "Follow up on previous discussion points.";
}

function renderList(container, items, emptyMsg) {
  container.innerHTML = "";
  if (!items || items.length === 0) {
    container.innerHTML = `<li style="color: var(--text-muted);">${emptyMsg}</li>`;
    return;
  }
  items.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    container.appendChild(li);
  });
}

// Confirm and Schedule Follow-Up via Google Calendar (in View 1)
async function scheduleFollowUpEvent() {
  btnConfirmSchedule.disabled = true;
  btnConfirmSchedule.textContent = "Scheduling with Google Calendar API...";

  const payload = {
    summary: followupTitle.value.trim() || "Follow-up Meeting",
    description: followupAgenda.value.trim(),
    start_time: new Date(followupDateTime.value).toISOString(),
    end_time: new Date(new Date(followupDateTime.value).getTime() + parseInt(followupDuration.value, 10) * 60000).toISOString(),
    attendees: followupAttendees.value.split(",").map(e => e.trim()).filter(e => e)
  };

  try {
    const res = await fetch(`${API_BASE}/api/calendar/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    btnConfirmSchedule.disabled = false;
    btnConfirmSchedule.textContent = "📅 Confirm & Schedule Meeting (Google Calendar + Meet Link via n8n)";

    calendarSuccessBox.style.display = "block";
    const meetLink = result.meet_link || (result.event && result.event.hangoutLink) || "";
    const htmlLink = result.html_link || (result.event && result.event.htmlLink) || "#";

    calendarSuccessBox.innerHTML = `
      ✅ <strong>Event Scheduled & Confirmed!</strong><br>
      ${result.n8n_triggered ? `<span style="display: inline-block; background: rgba(34, 197, 94, 0.2); color: #4ade80; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; margin: 4px 0;">⚡ n8n Webhook: Calendar Created & Confirmation Email Sent via Gmail</span><br>` : ""}
      ${meetLink ? `<a href="${meetLink}" target="_blank" style="color: #93c5fd;">Join Google Meet</a> | ` : ""}
      <a href="${htmlLink}" target="_blank" style="color: #93c5fd;">Open Event in Google Calendar ↗</a>
    `;

    await loadTodaySchedule();
  } catch (err) {
    btnConfirmSchedule.disabled = false;
    btnConfirmSchedule.textContent = "📅 Confirm & Schedule Meeting (Google Calendar + Meet Link via n8n)";
    alert("Error scheduling event: " + err.message);
  }
}

// -------------------------------------------------------------
// VIEW 3: Client Management & Extension Transcripts
// -------------------------------------------------------------
async function loadClientsList() {
  try {
    const res = await fetch(`${API_BASE}/api/clients`);
    const data = await res.json();
    clientsListCache = data.clients || [];

    renderClientsContainer(clientsListCache);
    populateStudioClientSelector(clientsListCache);

    if (clientsListCache.length > 0 && !selectedClientObj) {
      selectClient(clientsListCache[0]);
    }
  } catch (err) {
    console.error("Error loading clients:", err);
  }
}

function renderClientsContainer(clients) {
  clientsContainer.innerHTML = "";

  if (clients.length === 0) {
    clientsContainer.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 12px;">
        No clients added yet.<br>Click <strong>"+ Add Client"</strong> to create one!
      </div>
    `;
    return;
  }

  clients.forEach(c => {
    const card = document.createElement("div");
    const isSelected = selectedClientObj && selectedClientObj.email.toLowerCase() === c.email.toLowerCase();
    card.className = `client-card ${isSelected ? "selected" : ""}`;
    card.innerHTML = `
      <div class="client-card-name">${escapeHtml(c.name)}</div>
      <div class="client-card-email">${escapeHtml(c.email)}</div>
      ${c.company ? `<div class="client-card-company">🏢 ${escapeHtml(c.company)}</div>` : ""}
    `;
    card.addEventListener("click", () => selectClient(c));
    clientsContainer.appendChild(card);
  });
}

function populateStudioClientSelector(clients) {
  if (!studioClientSelector) return;
  studioClientSelector.innerHTML = `<option value="">-- Select Client --</option>`;
  clients.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.email;
    opt.textContent = `${c.name} (${c.email})`;
    if (activeAttendeeEmail && activeAttendeeEmail.toLowerCase() === c.email.toLowerCase()) {
      opt.selected = true;
    }
    studioClientSelector.appendChild(opt);
  });
}

function selectClient(client) {
  selectedClientObj = client;
  activeAttendeeEmail = client.email;

  renderClientsContainer(clientsListCache);

  const initials = client.name ? client.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "CL";
  clientAvatar.textContent = initials;
  clientName.textContent = client.name;
  clientEmail.textContent = client.email;
  clientCompany.textContent = client.company ? `🏢 ${client.company}` : "Personal Contact";
  clientMeetingCountPill.textContent = `${client.meeting_count || 0} Past Meeting${(client.meeting_count === 1) ? '' : 's'}`;
  btnClientTargetName.textContent = client.name.split(" ")[0];

  if (studioClientSelector) {
    studioClientSelector.value = client.email;
  }

  loadClientMeetings(client.email);
}

async function loadClientMeetings(email) {
  clientMeetingsList.innerHTML = `<div class="loader-state"><div class="spinner"></div><p>Loading past meetings & transcripts...</p></div>`;

  try {
    const res = await fetch(`${API_BASE}/api/clients/${encodeURIComponent(email)}/meetings`);
    const data = await res.json();
    const meetings = data.meetings || [];

    clientMeetingsList.innerHTML = "";

    if (meetings.length === 0) {
      clientMeetingsList.innerHTML = `
        <div class="empty-history-hint" style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">📜</div>
          <strong>No past meetings recorded for ${escapeHtml(selectedClientObj.name)} yet.</strong>
          <p style="font-size: 12px; margin-top: 6px;">
            Click <strong>"Start Meeting with ${escapeHtml(selectedClientObj.name.split(" ")[0])}"</strong> above to record your first meeting with the Chrome Extension!
          </p>
        </div>
      `;
      return;
    }

    meetings.forEach((m, idx) => {
      const card = document.createElement("div");
      card.className = "meeting-record-card";

      const dateStr = m.timestamp ? new Date(m.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : "Past Meeting";
      const captions = m.captions || [];

      let transcriptHtml = "";
      if (captions.length > 0) {
        transcriptHtml = captions.map(c => `
          <div class="transcript-line">
            <span class="transcript-speaker">${escapeHtml(c.speaker || "Speaker")}:</span>
            <span class="transcript-text">${escapeHtml(c.text)}</span>
          </div>
        `).join("");
      } else {
        transcriptHtml = `<div style="font-size: 11px; color: var(--text-muted);">No raw caption chunks saved for this meeting.</div>`;
      }

      card.innerHTML = `
        <div class="meeting-card-header">
          <div class="meeting-title">📌 ${escapeHtml(m.title || "Meeting")}</div>
          <div class="meeting-date">📅 ${dateStr}</div>
        </div>
        ${m.summary ? `<div class="meeting-summary-block"><strong>Summary:</strong> ${escapeHtml(m.summary)}</div>` : ""}
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; font-size: 12px;">
          <div>
            <strong style="color: #818cf8;">🙋 Promises by Us:</strong>
            <ul style="padding-left: 16px; margin-top: 4px; color: #cbd5e1;">
              ${(m.promises_by_us && m.promises_by_us.length > 0) ? m.promises_by_us.map(p => `<li>${escapeHtml(p)}</li>`).join("") : `<li style="color: var(--text-muted);">None</li>`}
            </ul>
          </div>
          <div>
            <strong style="color: #34d399;">👥 Promises by Client:</strong>
            <ul style="padding-left: 16px; margin-top: 4px; color: #cbd5e1;">
              ${(m.promises_by_them && m.promises_by_them.length > 0) ? m.promises_by_them.map(p => `<li>${escapeHtml(p)}</li>`).join("") : `<li style="color: var(--text-muted);">None</li>`}
            </ul>
          </div>
        </div>

        <button class="transcript-toggle-btn" id="btnToggleTranscript_${idx}">
          💬 View Full Extension Transcript (${captions.length} lines) ▾
        </button>
        <div class="transcript-box" id="transcriptBox_${idx}">
          ${transcriptHtml}
        </div>
      `;

      clientMeetingsList.appendChild(card);

      const toggleBtn = card.querySelector(`#btnToggleTranscript_${idx}`);
      const transcriptBox = card.querySelector(`#transcriptBox_${idx}`);
      toggleBtn.addEventListener("click", () => {
        const isHidden = transcriptBox.style.display === "none" || !transcriptBox.style.display;
        transcriptBox.style.display = isHidden ? "block" : "none";
        toggleBtn.textContent = isHidden 
          ? `💬 Hide Extension Transcript ▴` 
          : `💬 View Full Extension Transcript (${captions.length} lines) ▾`;
      });
    });
  } catch (err) {
    clientMeetingsList.innerHTML = `<div style="color: var(--danger); padding: 20px;">Error loading meetings: ${err.message}</div>`;
  }
}

// -------------------------------------------------------------
// Interactive Helpers & Event Listeners
// -------------------------------------------------------------
function setupEventListeners() {
  btnRefreshCalendar.addEventListener("click", loadTodaySchedule);
  btnLaunchCallWithBrief.addEventListener("click", () => switchView("studio"));

  if (btnOpenAddClientModal) btnOpenAddClientModal.addEventListener("click", openAddClientModal);
  if (btnCloseAddClientModal) btnCloseAddClientModal.addEventListener("click", closeAddClientModal);
  if (btnCancelAddClient) btnCancelAddClient.addEventListener("click", closeAddClientModal);
  if (btnSaveClient) btnSaveClient.addEventListener("click", saveNewClient);

  if (clientSearchInput) {
    clientSearchInput.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = clientsListCache.filter(c => 
        c.name.toLowerCase().includes(q) || 
        c.email.toLowerCase().includes(q) || 
        (c.company && c.company.toLowerCase().includes(q))
      );
      renderClientsContainer(filtered);
    });
  }

  if (btnStartMeetingWithClient) {
    btnStartMeetingWithClient.addEventListener("click", () => {
      switchView("studio");
      if (selectedClientObj) {
        studioMeetingTitle.textContent = `Live Meeting: ${selectedClientObj.name}`;
      }
    });
  }

  if (studioClientSelector) {
    studioClientSelector.addEventListener("change", (e) => {
      activeAttendeeEmail = e.target.value;
      const found = clientsListCache.find(c => c.email.toLowerCase() === activeAttendeeEmail.toLowerCase());
      if (found) {
        selectedClientObj = found;
        studioMeetingTitle.textContent = `Live Meeting: ${found.name}`;
      }
    });
  }

  btnStudioWrapMeeting.addEventListener("click", wrapCallAndAnalyze);
  btnConfirmSchedule.addEventListener("click", scheduleFollowUpEvent);

  document.getElementById("btnGlobalRefresh").addEventListener("click", async () => {
    await loadTodaySchedule();
    await loadClientsList();
    await syncActiveMeetingStream();
  });

  const btnLaunchDemoTop = document.getElementById("btnLaunchDemoTop");
  if (btnLaunchDemoTop) btnLaunchDemoTop.addEventListener("click", launchInteractiveDemo);

  document.querySelectorAll(".btn-tag").forEach(btn => {
    btn.addEventListener("click", () => {
      const tag = btn.getAttribute("data-tag");
      const textarea = studioScratchpad;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;
      textarea.value = val.substring(0, start) + tag + val.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + tag.length;
      textarea.focus();
      textarea.dispatchEvent(new Event("input"));
    });
  });

  btnSimulateDialogue.addEventListener("click", async () => {
    const targetName = selectedClientObj ? selectedClientObj.name : "Client";
    const quotes = [
      { speaker: targetName, text: "We need the SSO SAML configuration confirmed before our security audit." },
      { speaker: "Alex Miller (You)", text: "I can guarantee the documentation will be sent by Thursday morning." },
      { speaker: targetName, text: "Excellent. Let's make sure we review the SLA tier next week." },
      { speaker: "Alex Miller (You)", text: "Agreed. I will put a 30-minute calendar invite on both our schedules." }
    ];
    const pick = quotes[Math.floor(Math.random() * quotes.length)];
    await fetch(`${API_BASE}/api/stream/caption`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meeting_id: activeMeetingId,
        speaker: pick.speaker,
        text: pick.text
      })
    });
    await syncActiveMeetingStream();
  });

  btnClearDialogue.addEventListener("click", () => {
    renderDialogueCaptions([]);
  });

  if (btnClearNotes) {
    btnClearNotes.addEventListener("click", () => {
      studioScratchpad.value = "";
      studioScratchpad.dispatchEvent(new Event("input"));
    });
  }
}

// Modal Handlers
function openAddClientModal() {
  addClientModal.style.display = "flex";
  modalClientName.value = "";
  modalClientEmail.value = "";
  modalClientCompany.value = "";
  modalClientPhone.value = "";
  modalClientNotes.value = "";
  modalClientName.focus();
}

function closeAddClientModal() {
  addClientModal.style.display = "none";
}

async function saveNewClient() {
  const name = modalClientName.value.trim();
  const email = modalClientEmail.value.trim();
  const company = modalClientCompany.value.trim();
  const phone = modalClientPhone.value.trim();
  const notes = modalClientNotes.value.trim();

  if (!name || !email) {
    alert("Please provide both Client Name and Email Address.");
    return;
  }

  btnSaveClient.disabled = true;
  btnSaveClient.textContent = "Saving...";

  try {
    const res = await fetch(`${API_BASE}/api/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, company, phone, notes })
    });

    const data = await res.json();
    btnSaveClient.disabled = false;
    btnSaveClient.textContent = "Save Client";
    closeAddClientModal();

    await loadClientsList();
    if (data.client) {
      selectClient(data.client);
    }
  } catch (err) {
    btnSaveClient.disabled = false;
    btnSaveClient.textContent = "Save Client";
    alert("Error saving client: " + err.message);
  }
}

async function launchInteractiveDemo() {
  const demoClient = await createDemoClientIfNeeded();

  switchView("studio");
  studioMeetingTitle.textContent = `Live Meeting: ${demoClient.name}`;
  activeAttendeeEmail = demoClient.email;
  if (studioClientSelector) studioClientSelector.value = demoClient.email;
  
  dialogueFeed.innerHTML = "";
  captionCount.textContent = "0 utterances";

  const demoLines = [
    { speaker: demoClient.name, text: "Hey Alex! Thanks for jumping on. We need to finalize the mobile app launch date and sync on deliverables." },
    { speaker: "Alex Miller (You)", text: "I can commit to finishing the backend API documentation and sending it over by Thursday afternoon." },
    { speaker: demoClient.name, text: "Awesome. I will finalize the Figma UI mockups and invite beta testers by Friday." },
    { speaker: "Alex Miller (You)", text: "Perfect! Let's schedule our follow-up sync for next Tuesday at 2 PM to review beta feedback." }
  ];

  for (let i = 0; i < demoLines.length; i++) {
    const line = demoLines[i];
    await fetch(`${API_BASE}/api/stream/caption`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meeting_id: activeMeetingId,
        speaker: line.speaker,
        text: line.text
      })
    });
    await new Promise(r => setTimeout(r, 400));
    await syncActiveMeetingStream();
  }

  studioScratchpad.value = `[Promise: Deliver backend API documentation by Thursday afternoon]\n[Action: ${demoClient.name} finalizing Figma UI mockups by Friday]\n[Decision: Next sync scheduled for Tuesday 2 PM]`;
  studioScratchpad.dispatchEvent(new Event("input"));

  await new Promise(r => setTimeout(r, 600));

  await wrapCallAndAnalyze();
}

async function createDemoClientIfNeeded() {
  const demoEmail = "vijay@example.com";
  let found = clientsListCache.find(c => c.email.toLowerCase() === demoEmail);
  if (!found) {
    const res = await fetch(`${API_BASE}/api/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Vijay Siddhath",
        email: demoEmail,
        company: "Acme Corporation",
        notes: "Key executive for enterprise mobile app launch"
      })
    });
    const data = await res.json();
    await loadClientsList();
    found = data.client;
  }
  return found;
}

function setDefaultFollowupDate() {
  const nextTuesday = new Date();
  nextTuesday.setDate(nextTuesday.getDate() + ((2 + 7 - nextTuesday.getDay()) % 7 || 7));
  nextTuesday.setHours(14, 0, 0, 0); // 2:00 PM
  followupDateTime.value = nextTuesday.toISOString().slice(0, 16);
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[m]);
}
