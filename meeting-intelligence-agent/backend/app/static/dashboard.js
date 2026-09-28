/**
 * Meeting Intelligence Agent - Central Web Application Dashboard
 * Coordinates:
 * 1. Today's Schedule & Pre-Call Hindsight Briefings
 * 2. Live Meeting Studio & Scratchpad (Ingesting from Companion Extension)
 * 3. Post-Meeting Intelligence & Calendar Follow-up Center
 * 4. Contact Dossiers & Historical Memories in Hindsight Cloud
 */

const API_BASE = ""; // Same origin (FastAPI host)
let activeMeetingId = "meet-demo-sync";
let activeAttendeeEmail = "sarah.connor@acme.org";
let streamPollingTimer = null;
let currentSessionData = null;

// DOM Elements
const views = {
  schedule: document.getElementById("view-schedule"),
  studio: document.getElementById("view-studio"),
  intelligence: document.getElementById("view-intelligence"),
  contacts: document.getElementById("view-contacts")
};

const navItems = document.querySelectorAll(".nav-item");
const currentViewTitle = document.getElementById("currentViewTitle");
const currentViewSubtitle = document.getElementById("currentViewSubtitle");

// View 1 Elements
const todayMeetingsList = document.getElementById("todayMeetingsList");
const briefingContactName = document.getElementById("briefingContactName");
const briefingLoading = document.getElementById("briefingLoading");
const briefingContent = document.getElementById("briefingContent");
const btnRefreshCalendar = document.getElementById("btnRefreshCalendar");
const btnLaunchCallWithBrief = document.getElementById("btnLaunchCallWithBrief");

// View 2 Elements
const studioMeetingTitle = document.getElementById("studioMeetingTitle");
const studioMeetingId = document.getElementById("studioMeetingId");
const dialogueFeed = document.getElementById("dialogueFeed");
const captionCount = document.getElementById("captionCount");
const studioScratchpad = document.getElementById("studioScratchpad");
const scratchpadSaveStatus = document.getElementById("scratchpadSaveStatus");
const btnStudioWrapMeeting = document.getElementById("btnStudioWrapMeeting");
const btnSimulateDialogue = document.getElementById("btnSimulateDialogue");
const btnClearDialogue = document.getElementById("btnClearDialogue");
const btnLoadDemoNotes = document.getElementById("btnLoadDemoNotes");

// View 3 Elements
const intelLoadingState = document.getElementById("intelLoadingState");
const intelMainContent = document.getElementById("intelMainContent");
const hindsightMemoryDetails = document.getElementById("hindsightMemoryDetails");
const intelSummary = document.getElementById("intelSummary");
const intelPromisesUs = document.getElementById("intelPromisesUs");
const intelPromisesThem = document.getElementById("intelPromisesThem");
const intelOpenFollowups = document.getElementById("intelOpenFollowups");
const intelDiscrepancies = document.getElementById("intelDiscrepancies");
const followupAttendeeName = document.getElementById("followupAttendeeName");
const followupSuggestedDate = document.getElementById("followupSuggestedDate");
const followupTitle = document.getElementById("followupTitle");
const followupDateTime = document.getElementById("followupDateTime");
const followupAttendees = document.getElementById("followupAttendees");
const followupDuration = document.getElementById("followupDuration");
const followupAgenda = document.getElementById("followupAgenda");
const btnConfirmSchedule = document.getElementById("btnConfirmSchedule");
const calendarSuccessBox = document.getElementById("calendarSuccessBox");

// View 4 Elements
const contactsContainer = document.getElementById("contactsContainer");
const contactSearchInput = document.getElementById("contactSearchInput");
const dossierAvatar = document.getElementById("dossierAvatar");
const dossierContactName = document.getElementById("dossierContactName");
const dossierContactEmail = document.getElementById("dossierContactEmail");
const dossierMemoryCount = document.getElementById("dossierMemoryCount");
const dossierBriefing = document.getElementById("dossierBriefing");
const dossierTimeline = document.getElementById("dossierTimeline");

// Initialize on DOM Load
document.addEventListener("DOMContentLoaded", async () => {
  setupNavigation();
  setupScratchpadAutoSave();
  setupEventListeners();
  setDefaultFollowupDate();

  // Load initial data
  await loadTodaySchedule();
  await loadInitialBriefing("sarah.connor@acme.org");
  await syncActiveMeetingStream();
  await loadContactsList();

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

  document.getElementById("btnLaunchStudioDirect").addEventListener("click", () => switchView("studio"));
}

function switchView(viewName) {
  navItems.forEach(b => b.classList.remove("active"));
  Object.values(views).forEach(v => v.classList.remove("active"));

  const targetNav = document.querySelector(`.nav-item[data-view="view-${viewName}"]`);
  const targetView = views[viewName];

  if (targetNav) targetNav.classList.add("active");
  if (targetView) targetView.classList.add("active");

  const titles = {
    schedule: { title: "Today's Schedule & Pre-Call Briefings", sub: "Autonomous context recall powered by Vectorize Hindsight Cloud" },
    studio: { title: "Live Meeting Studio & Scratchpad", sub: "Real-time Google Meet stream ingested from Chrome Companion Extension" },
    intelligence: { title: "Post-Call Intelligence & Follow-up Center", sub: "Structured commitment analysis, discrepancy detection & Google Calendar actions" },
    contacts: { title: "Contact Dossiers & Memory Vault", sub: "Cumulative entity memories and timeline history stored in Hindsight Cloud" }
  };

  if (titles[viewName]) {
    currentViewTitle.textContent = titles[viewName].title;
    currentViewSubtitle.textContent = titles[viewName].sub;
  }
}

// -------------------------------------------------------------
// VIEW 1: Schedule & Pre-Meeting Briefings
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
            <span class="item-time">⏰ ${startTime} - ${endTime}</span>
          </div>
          <div class="item-desc">${escapeHtml(evt.description || "Review deliverables and project requirements.")}</div>
          <div class="item-footer">
            <span>👤 ${escapeHtml(attendeeName)}</span>
            <span style="color: #6366f1;">${evt.hangoutLink ? "Google Meet ↗" : "Virtual"}</span>
          </div>
        `;

        item.addEventListener("click", () => {
          document.querySelectorAll(".schedule-item").forEach(el => el.classList.remove("selected"));
          item.classList.add("selected");
          activeAttendeeEmail = attendeeEmail;
          activeMeetingId = evt.hangoutLink ? evt.hangoutLink.split("/").pop() : `meet-${idx + 1}`;
          loadInitialBriefing(attendeeEmail);
        });

        todayMeetingsList.appendChild(item);
      });
    } else {
      todayMeetingsList.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 20px;">No scheduled calls for today.</div>`;
    }
  } catch (err) {
    console.error("Error loading today's schedule:", err);
  }
}

async function loadInitialBriefing(attendeeEmail) {
  briefingContactName.textContent = `Target: ${attendeeEmail}`;
  briefingLoading.style.display = "flex";
  briefingContent.textContent = "";

  try {
    const res = await fetch(`${API_BASE}/api/meetings/prep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: "alex@example.com",
        attendee_email: attendeeEmail
      })
    });
    const data = await res.json();
    briefingLoading.style.display = "none";
    briefingContent.textContent = data.briefing || "No prior history found in Hindsight bank.";
  } catch (err) {
    briefingLoading.style.display = "none";
    briefingContent.textContent = "Error recalling briefing from Hindsight: " + err.message;
  }
}

// -------------------------------------------------------------
// VIEW 2: Live Meeting Studio & Scratchpad
// -------------------------------------------------------------
async function syncActiveMeetingStream() {
  try {
    const res = await fetch(`${API_BASE}/api/stream/session/${activeMeetingId}`);
    const session = await res.json();
    currentSessionData = session;

    studioMeetingTitle.textContent = session.title || `Meeting: ${activeMeetingId}`;
    studioMeetingId.textContent = session.meeting_id;
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
    dialogueFeed.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 30px;">Waiting for real-time speech from Google Meet extension stream...</div>`;
    return;
  }

  captions.forEach(c => {
    const el = document.createElement("div");
    el.className = "utterance";
    const timeStr = c.timestamp ? new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "";

    el.innerHTML = `
      <div class="utterance-header">
        <span class="speaker-tag">${escapeHtml(c.speaker || "Participant")}:</span>
        <span class="time-tag">${timeStr}</span>
      </div>
      <div class="utterance-text">${escapeHtml(c.text || "")}</div>
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
        // Update captions if count changed
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

// -------------------------------------------------------------
// VIEW 3: Wrap Call & Post-Meeting Intelligence
// -------------------------------------------------------------
async function wrapCallAndAnalyze() {
  switchView("intelligence");
  intelLoadingState.style.display = "flex";
  intelMainContent.style.display = "none";

  const notes = studioScratchpad.value;
  const transcriptText = (currentSessionData && currentSessionData.captions)
    ? currentSessionData.captions.map(c => `${c.speaker}: ${c.text}`).join("\n")
    : "Sarah: Please send pricing tiers by Thursday.\nAlex: I will deliver pricing sheet by Thursday.";

  try {
    const res = await fetch(`${API_BASE}/api/meetings/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: "alex@example.com",
        attendee_email: activeAttendeeEmail,
        transcript: transcriptText,
        user_notes: notes,
        meeting_id: activeMeetingId
      })
    });

    const data = await res.json();
    intelLoadingState.style.display = "none";
    intelMainContent.style.display = "block";
    renderIntelligenceResults(data);

    // Refresh contact dossiers to reflect retained memory
    await loadContactsList();
  } catch (err) {
    intelLoadingState.style.display = "none";
    alert("Error during meeting synthesis: " + err.message);
  }
}

function renderIntelligenceResults(data) {
  const analysis = data.analysis || {};
  const hindsightInfo = data.hindsight_retention || {};

  // Memory Badge & n8n Sync Indicator
  hindsightMemoryDetails.innerHTML = `Bank: ${hindsightInfo.bank_id || "bank_alex_example_com"} | Document: ${hindsightInfo.document_id || "meet_123"}<br><span style="color: #4ade80; font-size: 0.8rem;">📊 Action items automatically synced to Google Sheets via n8n</span>`;

  // Summary
  intelSummary.textContent = analysis.summary || "Meeting completed successfully.";

  // Lists
  renderList(intelPromisesUs, analysis.promises_by_us, "No promises recorded for user.");
  renderList(intelPromisesThem, analysis.promises_by_them, "No promises recorded for attendee.");
  renderList(intelOpenFollowups, analysis.missed_or_pending_followups, "No open items detected.");
  renderList(intelDiscrepancies, analysis.note_discrepancies, "Scratchpad notes match spoken dialogue.");

  // Follow-up card setup
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

  // Pre-fill agenda
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

// Confirm and Schedule Follow-Up via Google Calendar
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
    btnConfirmSchedule.textContent = "📅 Confirm & Schedule Next Meeting via Google Calendar";

    calendarSuccessBox.style.display = "block";
    const meetLink = result.meet_link || (result.event && result.event.hangoutLink) || "";
    const htmlLink = result.html_link || (result.event && result.event.htmlLink) || "#";

    calendarSuccessBox.innerHTML = `
      ✅ <strong>Event Scheduled & Confirmed!</strong><br>
      ${result.n8n_triggered ? `<span style="display: inline-block; background: rgba(34, 197, 94, 0.2); color: #4ade80; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; margin: 4px 0;">⚡ n8n Webhook: Calendar Created & Confirmation Email Sent via Gmail</span><br>` : ""}
      ${meetLink ? `<a href="${meetLink}" target="_blank" style="color: #93c5fd;">Join Google Meet</a> | ` : ""}
      <a href="${htmlLink}" target="_blank" style="color: #93c5fd;">Open Event in Google Calendar ↗</a>
    `;
  } catch (err) {
    btnConfirmSchedule.disabled = false;
    btnConfirmSchedule.textContent = "📅 Confirm & Schedule Next Meeting via Google Calendar";
    alert("Error scheduling event: " + err.message);
  }
}

// -------------------------------------------------------------
// VIEW 4: Contact History / Hindsight Dossier
// -------------------------------------------------------------
async function loadContactsList() {
  try {
    const res = await fetch(`${API_BASE}/api/contacts?user_id=alex@example.com`);
    const data = await res.json();
    contactsContainer.innerHTML = "";

    if (data.contacts && data.contacts.length > 0) {
      data.contacts.forEach((contact, idx) => {
        const card = document.createElement("div");
        card.className = `contact-card ${idx === 0 ? "selected" : ""}`;
        card.innerHTML = `
          <div class="contact-name">${escapeHtml(contact.name)}</div>
          <div class="contact-email">${escapeHtml(contact.email)}</div>
          <div class="contact-meta">🧠 ${contact.memory_count} memory records</div>
        `;
        card.addEventListener("click", () => {
          document.querySelectorAll(".contact-card").forEach(c => c.classList.remove("selected"));
          card.classList.add("selected");
          loadContactDossier(contact.email, contact.name);
        });
        contactsContainer.appendChild(card);
      });

      // Load first contact dossier by default
      loadContactDossier(data.contacts[0].email, data.contacts[0].name);
    }
  } catch (err) {
    console.error("Error loading contacts:", err);
  }
}

async function loadContactDossier(email, name) {
  dossierAvatar.textContent = name ? name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) : "SC";
  dossierContactName.textContent = name || email;
  dossierContactEmail.textContent = email;
  dossierBriefing.textContent = "Querying Vectorize Hindsight memory bank...";
  dossierTimeline.innerHTML = "";

  try {
    const res = await fetch(`${API_BASE}/api/contacts/${encodeURIComponent(email)}/dossier?user_id=alex@example.com`);
    const dossier = await res.json();

    dossierMemoryCount.textContent = `${dossier.memory_count || 1} Memory Records`;
    dossierBriefing.textContent = dossier.briefing || "No historical memories found.";

    if (dossier.timeline && dossier.timeline.length > 0) {
      dossier.timeline.forEach(event => {
        const ev = document.createElement("div");
        ev.className = "timeline-event";
        const dateStr = event.timestamp ? new Date(event.timestamp).toLocaleDateString() + " " + new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
        ev.innerHTML = `
          <div class="timeline-event-header">
            <strong>${escapeHtml(event.context || "Meeting")}</strong> • ${dateStr}
          </div>
          <div class="timeline-event-body">${escapeHtml(event.content || "")}</div>
        `;
        dossierTimeline.appendChild(ev);
      });
    } else {
      dossierTimeline.innerHTML = `<div style="color: var(--text-muted); padding: 10px;">No timeline items recorded yet.</div>`;
    }
  } catch (err) {
    dossierBriefing.textContent = "Error loading dossier: " + err.message;
  }
}

// -------------------------------------------------------------
// Interactive Helpers & Event Listeners
// -------------------------------------------------------------
function setupEventListeners() {
  btnRefreshCalendar.addEventListener("click", loadTodaySchedule);
  btnLaunchCallWithBrief.addEventListener("click", () => {
    switchView("studio");
  });

  btnStudioWrapMeeting.addEventListener("click", wrapCallAndAnalyze);
  btnConfirmSchedule.addEventListener("click", scheduleFollowUpEvent);
  document.getElementById("btnGlobalRefresh").addEventListener("click", async () => {
    await loadTodaySchedule();
    await syncActiveMeetingStream();
    await loadContactsList();
  });

  // Scratchpad Quick Tags
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

  // Studio Simulation line
  btnSimulateDialogue.addEventListener("click", async () => {
    const quotes = [
      { speaker: "Sarah Connor", text: "We need the SSO SAML configuration confirmed before our security audit." },
      { speaker: "Alex", text: "I can guarantee the SAML documentation will be sent by Thursday morning." },
      { speaker: "Sarah Connor", text: "Excellent. Let's make sure we review the SLA tier next Tuesday." },
      { speaker: "Alex", text: "Agreed. I will put a 30-minute calendar invite on both our schedules." }
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
    dialogueFeed.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px;">Captions cleared.</div>';
    captionCount.textContent = "0 utterances";
  });

  btnLoadDemoNotes.addEventListener("click", () => {
    studioScratchpad.value = 
`[Promise: I will deliver the updated enterprise pricing breakdown by Friday afternoon]
[Decision: Agreed to use SSO SAML for user provisioning]
[Action: Sarah needs to send over technical security questionnaire]
Note: Verify 99.9% SLA commitment before next call.`;
    studioScratchpad.dispatchEvent(new Event("input"));
  });
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
