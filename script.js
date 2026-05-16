// ===================================
// CESC CHATBOT — JavaScript Logic
// ===================================

// DOM Elements
const chatBubble = document.getElementById("chatBubble");
const chatbot = document.getElementById("chatbot");
const closeBtn = document.getElementById("closeBtn");
const minimizeBtn = document.getElementById("minimizeBtn");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const audioBtn = document.getElementById("audioBtn");
const chatBody = document.getElementById("chatBody");
const fileUpload = document.getElementById("fileUpload");
const recordingUI = document.getElementById("recordingUI");
const inputWrapper = document.getElementById("inputWrapper");
const cancelRecording = document.getElementById("cancelRecording");
const recordingTimer = document.getElementById("recordingTimer");
const fileChipRemove = document.getElementById("fileChipRemove");

// Attachment preview slot elements
const attachmentPreviewSlot = document.getElementById("attachmentPreviewSlot");
const attachThumb = document.getElementById("attachThumb");
const attachFileIcon = document.getElementById("attachFileIcon");
const attachName = document.getElementById("attachName");
const attachType = document.getElementById("attachType");

// State
let isRecording = false;
let recordingInterval = null;
let recordingStartTime = 0;
let mediaRecorder = null;
let audioChunks = [];
let pendingFile = null;
let pendingFileDataUrl = null;

// Session inactivity timeout — 15 minutes
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
let sessionTimeoutHandle = null;

// P1 colour token — used for button resets in JS
const COLOR_PRIMARY = "#0056B3";

// ===================================
// LOCATION PERMISSION
// ===================================

function requestLocationIfNeeded() {
  return new Promise((resolve) => {
    if (sessionStorage.getItem("userLat") !== null) { resolve(); return; }
    if (!navigator.geolocation) {
      sessionStorage.setItem("userLat", "NA");
      sessionStorage.setItem("userLng", "NA");
      resolve(); return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        sessionStorage.setItem("userLat", pos.coords.latitude);
        sessionStorage.setItem("userLng", pos.coords.longitude);
        console.log("Location stored:", pos.coords.latitude, pos.coords.longitude);
        resolve();
      },
      () => {
        sessionStorage.setItem("userLat", "NA");
        sessionStorage.setItem("userLng", "NA");
        console.log("Location denied — stored NA");
        resolve();
      }
    );
  });
}

function getUserLocation() {
  const lat = sessionStorage.getItem("userLat") ?? "NA";
  const lng = sessionStorage.getItem("userLng") ?? "NA";
  return {
    lat: lat !== "NA" ? parseFloat(lat) : "NA",
    lng: lng !== "NA" ? parseFloat(lng) : "NA"
  };
}

// ===================================
// CHAT BUBBLE & TOGGLE
// ===================================

chatBubble.addEventListener("click", function () {
  chatbot.classList.add("active");
  chatBubble.style.display = "none";
  userInput.focus();
});

closeBtn.addEventListener("click", function () {
  chatbot.classList.remove("active");
  setTimeout(() => { chatBubble.style.display = "flex"; }, 300);
});

minimizeBtn.addEventListener("click", function () {
  chatbot.classList.remove("active");
  setTimeout(() => { chatBubble.style.display = "flex"; }, 300);
});

// Clean up SSE connection when page unloads
window.addEventListener("beforeunload", function () {
  if (eventSource) {
    eventSource.close();
    console.log("SSE connection closed");
  }
});

// ===================================
// MESSAGE HANDLING
// ===================================

function addMessage(text, sender) {
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message", sender);

  const messageContent = document.createElement("div");
  messageContent.classList.add("message-content");

  // Clean up explicit newlines from json payloads
  let cleanText = text.replace(/\\n/g, '\n');

  // Apply our custom specific regex replacements
  cleanText = cleanText
    .replace(/\(CID:\s*(\d+)\)/g, '**(CID: $1)**')
    .replace(/CID:\s*(\d+)/g, '**CID: $1**');

  let formattedText = "";
  if (typeof marked !== 'undefined') {
    // Create a custom renderer to safely intercept and format all links
    const renderer = new marked.Renderer();
    renderer.link = function ({ href, title, text }) { // marked automatically resolves these
      if (sender === "bot") {
        // If the URL was raw (text equals the long link), shorten it to "Click Here"
        // Otherwise, preserve the markdown link text if it was explicitly provided
        const linkLabel = (text === href || text === href.replace(/^https?:\/\//, '')) ? 'Click Here' : text;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:#0056B3;text-decoration:underline;">${linkLabel}</a>`;
      }
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    };

    // Parse tables and all standard markdown natively including links
    formattedText = marked.parse(cleanText, { breaks: true, renderer: renderer });
  } else {
    // Basic fallback if marked doesn't load
    formattedText = cleanText
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');

    // Apply the old regex logic ONLY if marked failed to load
    if (sender === "bot") {
      const urlRegex = /(https?:\/\/[^\s<"']+)/g;
      formattedText = formattedText.replace(urlRegex, url => {
        if (url.includes('href="')) return url;
        const cleanUrl = url.replace(/(<br>|<[^>]+>)+$/g, '').replace(/[.,;!?]+$/, '');
        return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" style="color:#0056B3;text-decoration:underline;">Click Here</a>`;
      });
    }
  }

  messageContent.innerHTML = formattedText;

  messageDiv.appendChild(messageContent);
  chatBody.appendChild(messageDiv);
  chatBody.scrollTop = chatBody.scrollHeight;
}

// Post-send attachment bubble (WhatsApp-style)
function addFileMessage(file, caption, dataUrl) {
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message", "user");

  const bubble = document.createElement("div");
  bubble.classList.add("message-content", "attachment-bubble");

  const card = document.createElement("div");
  card.classList.add("sent-attachment-card");

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const ext = file.name.split(".").pop().toUpperCase();

  if (isImage && dataUrl) {
    const thumb = document.createElement("img");
    thumb.src = dataUrl;
    thumb.alt = file.name;
    thumb.classList.add("sent-attach-thumb-img");
    card.appendChild(thumb);
  } else if (isVideo && dataUrl) {
    const videoEl = document.createElement("video");
    videoEl.src = dataUrl;
    videoEl.controls = true;
    videoEl.muted = false;
    videoEl.autoplay = false;
    videoEl.loop = false;
    videoEl.playsInline = true;          // prevent iOS from auto-fullscreening
    videoEl.preload = "metadata";        // loads first frame → no black poster
    videoEl.classList.add("sent-attach-thumb-video");
    card.appendChild(videoEl);
  } else {
    const banner = document.createElement("div");
    banner.classList.add("sent-attach-icon-banner");
    banner.innerHTML = isVideo
      ? '<i class="fas fa-video"></i>'
      : '<i class="fas fa-file-alt"></i>';
    card.appendChild(banner);
  }

  const meta = document.createElement("div");
  meta.classList.add("sent-attach-meta");

  const nameEl = document.createElement("span");
  nameEl.classList.add("sent-attach-name");
  nameEl.textContent = file.name;

  const badge = document.createElement("span");
  badge.classList.add("sent-attach-badge");
  badge.textContent = ext;

  meta.appendChild(nameEl);
  meta.appendChild(badge);
  card.appendChild(meta);

  if (caption) {
    const captionEl = document.createElement("div");
    captionEl.classList.add("sent-attach-caption");
    captionEl.textContent = caption;
    card.appendChild(captionEl);
  }

  bubble.appendChild(card);
  messageDiv.appendChild(bubble);
  chatBody.appendChild(messageDiv);
  chatBody.scrollTop = chatBody.scrollHeight;
}

// Typing indicator — visible label + aria-label for screen readers
function showTypingIndicator() {
  const typingDiv = document.createElement("div");
  typingDiv.classList.add("message", "bot", "typing-indicator-wrapper");
  typingDiv.id = "typingIndicator";
  typingDiv.setAttribute("aria-label", "Aastha is typing");

  const typingContent = document.createElement("div");
  typingContent.classList.add("message-content", "typing-indicator");
  typingContent.setAttribute("role", "status");

  // Three animated dots
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.classList.add("typing-dot");
    typingContent.appendChild(dot);
  }

  // Visible label text
  const label = document.createElement("span");
  label.classList.add("typing-label");
  label.textContent = "Aastha is typing";
  typingContent.appendChild(label);

  typingDiv.appendChild(typingContent);
  chatBody.appendChild(typingDiv);
  chatBody.scrollTop = chatBody.scrollHeight;
}

function removeTypingIndicator() {
  const el = document.getElementById("typingIndicator");
  if (el) el.remove();
}

// ------- ANKIT ---------
function getOrCreateSessionId() {
  let session = JSON.parse(localStorage.getItem("session"));
  if (!session) {
    session = { "gck": "test_user_dev", "session_id": crypto.randomUUID() };
    localStorage.setItem("session", JSON.stringify(session));
  }
  return session;
}

// ===================================
// SESSION INACTIVITY TIMER
// ===================================

/**
 * Call this every time the user sends any message (text, file, or voice).
 * Cancels the previous countdown and starts a fresh 15-minute window.
 * If the window expires without another message, session_id is rotated to a
 * new UUID so the next interaction automatically starts a fresh backend session.
 */
function resetSessionTimer() {
  // Cancel any pending expiry
  if (sessionTimeoutHandle !== null) {
    clearTimeout(sessionTimeoutHandle);
    sessionTimeoutHandle = null;
  }

  sessionTimeoutHandle = setTimeout(() => {
    // Rotate only session_id, keep gck (user identity) intact
    const session = JSON.parse(localStorage.getItem("session")) || { gck: "test_user_dev" };
    const oldId = session.session_id;
    session.session_id = crypto.randomUUID();
    localStorage.setItem("session", JSON.stringify(session));

    console.log(
      `[Session] Inactivity timeout — session rotated.\n` +
      `  Old ID : ${oldId}\n` +
      `  New ID : ${session.session_id}`
    );

    // Reconnect SSE so the new session_id propagates to the notification stream
    initializeSSE();

    sessionTimeoutHandle = null;
  }, SESSION_TIMEOUT_MS);
}

// ------- ANKIT --------- 
// ===================================
// SSE - REAL-TIME OUTAGE NOTIFICATIONS
// ===================================

let eventSource = null;

function initializeSSE() {
  const session = getOrCreateSessionId();
  const sseUrl = `https://api.cesc.co.in/notification-stream/${session.gck}`;

  // Close existing connection if any
  if (eventSource) {
    eventSource.close();
  }

  try {
    eventSource = new EventSource(sseUrl);

    eventSource.onopen = () => {
      console.log("SSE connected to outage stream");
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("SSE RECEIVED:", data);

        // Route to the dynamic notification builder
        displayDynamicNotification(data);

      } catch (error) {
        console.error("Error parsing SSE data:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE ERROR:", error);

      // Attempt to reconnect after 5 seconds
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log("SSE connection closed. Reconnecting in 5 seconds...");
        setTimeout(initializeSSE, 5000);
      }
    };

  } catch (error) {
    console.error("Failed to initialize SSE:", error);
  }
}

const NOTIFICATION_CONFIG = {
  // Canonical event_type values (set by producer Lambda)
  OUTAGE_STARTED:   { label: "Power Outage Alert",  icon: "⚠️" },
  OUTAGE_RESOLVED:  { label: "Power Restored",       icon: "✅" },
  DOCKET_RESOLVED:  { label: "Docket Resolved",      icon: "✅" },
  PAYMENT_SUCCESS:  { label: "Payment Confirmed",    icon: "✅" },
  PAYMENT_FAILED:   { label: "Payment Failed",       icon: "❌" },
  LOW_BALANCE:      { label: "Low Balance Alert",    icon: "⚠️" },

  // Raw power_status aliases — guards against stale DynamoDB entries
  // stored before event_type normalisation was in place
  OUTAGE:           { label: "Power Outage Alert",  icon: "⚠️" },
  RESTORED:         { label: "Power Restored",       icon: "✅" },
};

function displayDynamicNotification(data) {
  // Try to find a config match, otherwise auto-format the type string
  const typeKey = (data.type || "").toUpperCase();
  const config = NOTIFICATION_CONFIG[typeKey] || {
    label: (data.type || "Notification").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    icon: "🔔"
  };

  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message", "bot", "dynamic-notification");

  const messageContent = document.createElement("div");
  messageContent.classList.add("message-content");

  let notificationText = `${config.icon} **${config.label}**\n\n`;

  if (data.message) {
    notificationText += data.message;
  } else {
    // Fallback for older outage objects that came as structured fields
    if (data.area) notificationText += `**Area:** ${data.area}\n`;
    if (data.status) notificationText += `**Status:** ${data.status}\n`;
    if (data.estimated_restoration) notificationText += `**Estimated Restoration:** ${data.estimated_restoration}\n`;
    if (data.affected_consumers) notificationText += `**Affected Consumers:** ${data.affected_consumers}\n`;
    if (data.reason) notificationText += `**Reason:** ${data.reason}\n`;
  }

  let formattedText = notificationText
    .replace(/\\n/g, '\n')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');

  messageContent.innerHTML = formattedText;
  messageDiv.appendChild(messageContent);
  chatBody.appendChild(messageDiv);

  // Handle WhatsApp Opt-In trigger
  if (typeKey === "DOCKET_RESOLVED" && sessionStorage.getItem("optInStatus") !== "true" && sessionStorage.getItem("optInStatus") !== "false") {
    const optInCard = document.createElement("div");
    optInCard.classList.add("message", "bot", "optin-card");
    optInCard.innerHTML = `
      <div class="message-content" style="background: #e8f5e9; border: 1px solid #4caf50; padding: 12px; border-radius: 8px;">
        <strong style="color: #2e7d32; display: flex; align-items: center; gap: 6px;">
          <i class="fab fa-whatsapp" style="font-size: 1.2em;"></i> WhatsApp Updates
        </strong>
        <div style="margin-top: 8px; margin-bottom: 12px; color: #333; font-size: 0.95em;">
          Would you like to receive future updates and alerts directly on WhatsApp?
        </div>
        <div style="display: flex; gap: 10px;">
          <button onclick="handleWhatsAppOptIn('Yes', this)" style="padding: 6px 16px; border-radius: 20px; border: none; background: #4caf50; color: white; cursor: pointer; font-weight: 500; transition: background 0.2s;">Yes, please</button>
          <button onclick="handleWhatsAppOptIn('No', this)" style="padding: 6px 16px; border-radius: 20px; border: 1px solid #4caf50; background: white; color: #4caf50; cursor: pointer; font-weight: 500; transition: background 0.2s;">No thanks</button>
        </div>
      </div>
    `;
    chatBody.appendChild(optInCard);
  }

  chatBody.scrollTop = chatBody.scrollHeight;

  // OS-level notification
  if (!chatbot.classList.contains("active") && "Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification(`CESC ${config.label}`, {
        body: data.message || "New notification received",
        icon: "/path/to/cesc-icon.png"
      });
    }
  }
}

// ===================================
// WHATSAPP OPT-IN HANDLER
// ===================================

window.handleWhatsAppOptIn = function(choice, btnElement) {
  const btnContainer = btnElement.parentElement;
  btnContainer.innerHTML = `<em>You selected: <strong>${choice}</strong></em>`;
  
  if (choice === 'Yes') {
    window.pendingOptIn = true;
    userInput.value = "Yes";
    sendMessage();
  } else {
    sessionStorage.setItem("optInStatus", "false");
  }
};

// ===================================
// SEND MESSAGE
// ===================================

async function sendMessage() {
  resetSessionTimer();

  const message = userInput.value.trim();
  const hasText = message !== "";
  const hasFile = pendingFile !== null;

  if (!hasText && !hasFile) return;

  await requestLocationIfNeeded();

  if (hasFile) {
    addFileMessage(pendingFile, hasText ? message : null, pendingFileDataUrl);
  } else {
    addMessage(message, "user");
  }

  userInput.value = "";
  userInput.disabled = true;
  audioBtn.disabled = true;
  audioBtn.style.backgroundColor = "red";

  const fileToUpload = pendingFile;
  clearFileChip();

  sendBtn.classList.remove("active");
  sendBtn.classList.add("hidden");
  audioBtn.classList.add("active");
  audioBtn.classList.remove("hidden");

  const session = await getOrCreateSessionId();
  showTypingIndicator();

  // Step 1: Upload file to S3 (if any)
  let uploadedFileName = "";
  if (fileToUpload) {
    try {
      const presignedRes = await fetch(
        "https://y3a5w97q7a.execute-api.ap-south-1.amazonaws.com/generate-presigned-url",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generateUploadUrl",
            fileName: fileToUpload.name,
            fileType: fileToUpload.type,
            userId: session.gck,
            sessionId: session.session_id
          })
        }
      );

      if (!presignedRes.ok) {
        const err = await presignedRes.json();
        throw new Error(err.error || `Backend error: ${presignedRes.status}`);
      }

      const { uploadUrl } = await presignedRes.json();

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": fileToUpload.type },
        body: fileToUpload
      });

      if (!uploadRes.ok) {
        throw new Error(`S3 upload failed: ${uploadRes.status} ${uploadRes.statusText}`);
      }

      uploadedFileName = fileToUpload.name;
    } catch (uploadError) {
      console.error("Upload error:", uploadError);
      removeTypingIndicator();
      addMessage(`❌ File upload failed: ${uploadError.message}`, "bot");
      userInput.disabled = false;
      audioBtn.disabled = false;
      audioBtn.style.backgroundColor = COLOR_PRIMARY;
      return;
    }
  }

  // Step 2: Send to backend
  // ----- DO NOT TAMPER CODE -----
  try {
    let file_name = "";
    if (uploadedFileName !== "") {
      file_name = `${session.gck}/${session.session_id}/${uploadedFileName}`;
    }

    const { lat, lng } = getUserLocation();
    console.log("Sending with location — lat:", lat, "lng:", lng);

    const response = await fetch("https://dev-api.cesc.co.in/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "user_id": session.gck,
        "session_id": session.session_id,
        "text": hasText ? message : `[File: ${uploadedFileName}]`,
        "document_file_name": file_name,
        "user_lat": lat,
        "user_long": lng,
        "channel": "WEB",
        "opt_in": sessionStorage.getItem("optInStatus") || "",
        "new_opt_in": window.pendingOptIn ? "true" : "false"
      })
    });

    if (!response.ok) {
      // Try to read a user-friendly message from the server's error body
      let serverReply = null;
      try {
        const errBody = await response.json();
        serverReply = errBody.reply || null;
      } catch (_) {}
      if (serverReply) {
        removeTypingIndicator();
        addMessage(serverReply, "bot");
        userInput.disabled = false;
        audioBtn.disabled = false;
        audioBtn.style.backgroundColor = COLOR_PRIMARY;
        return;
      }
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log("API Response:", data);

    removeTypingIndicator();

    if (data && data.opted_in !== undefined && data.opted_in !== null) {
      sessionStorage.setItem("optInStatus", data.opted_in ? "true" : "false");
    }
    window.pendingOptIn = false;

    if (data && data['reply']) {
      addMessage(data['reply'], "bot");
    } else if (data && data['status'] === 'error') {
      // Backend returned structured error — show user-friendly message
      addMessage(data['reply'] || "❌ Something went wrong. Please try again.", "bot");
    } else {
      console.error("No reply in response:", data);
      addMessage("❌ No response received from server. Please try again.", "bot");
    }

    userInput.disabled = false;
    audioBtn.disabled = false;
    audioBtn.style.backgroundColor = COLOR_PRIMARY;

  } catch (error) {
    console.error("Error:", error);
    removeTypingIndicator();
    // Try to show the server's user-friendly message if available
    let errMsg = "❌ Something went wrong. Please try again.";
    try {
      const errData = error._responseData;
      if (errData && errData.reply) errMsg = errData.reply;
    } catch (_) {}
    addMessage(errMsg, "bot");
    userInput.disabled = false;
    audioBtn.disabled = false;
    audioBtn.style.backgroundColor = COLOR_PRIMARY;
  }
}

sendBtn.addEventListener("click", sendMessage);

userInput.addEventListener("keypress", function (e) {
  if (e.key === "Enter") sendMessage();
});

// ===================================
// INPUT BUTTON TOGGLE
// ===================================

userInput.addEventListener("input", function () {
  if (userInput.value.trim() !== "") {
    sendBtn.classList.add("active");
    sendBtn.classList.remove("hidden");
    audioBtn.classList.remove("active");
    audioBtn.classList.add("hidden");
  } else {
    if (!pendingFile) {
      audioBtn.classList.add("active");
      audioBtn.classList.remove("hidden");
      sendBtn.classList.remove("active");
      sendBtn.classList.add("hidden");
    }
  }
});

// ===================================
// FILE UPLOAD — staged preview (P1)
// ===================================

function showFileChip(file) {
  pendingFile = file;

  const ext = file.name.split(".").pop().toUpperCase();
  attachName.textContent = file.name;
  attachType.textContent = ext;

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  if (isImage) {
    const reader = new FileReader();
    reader.onload = (e) => {
      pendingFileDataUrl = e.target.result;
      attachThumb.src = e.target.result;
      attachThumb.style.display = "block";
      attachFileIcon.style.display = "none";
    };
    reader.readAsDataURL(file);
  } else if (isVideo) {
    // Use an object URL for the video chip thumbnail — revoked in clearFileChip()
    if (pendingFileDataUrl && pendingFileDataUrl.startsWith("blob:")) {
      URL.revokeObjectURL(pendingFileDataUrl);
    }
    pendingFileDataUrl = URL.createObjectURL(file);
    attachThumb.style.display = "none";
    attachFileIcon.style.display = "flex";
    // Swap file-alt icon to video icon
    attachFileIcon.innerHTML = '<i class="fas fa-video"></i>';
  } else {
    pendingFileDataUrl = null;
    attachThumb.style.display = "none";
    attachFileIcon.style.display = "flex";
    attachFileIcon.innerHTML = '<i class="fas fa-file-alt"></i>';
  }

  attachmentPreviewSlot.style.display = "block";

  sendBtn.classList.add("active");
  sendBtn.classList.remove("hidden");
  audioBtn.classList.remove("active");
  audioBtn.classList.add("hidden");
}

function clearFileChip() {
  // Revoke any blob object URL allocated for video preview
  if (pendingFileDataUrl && pendingFileDataUrl.startsWith("blob:")) {
    URL.revokeObjectURL(pendingFileDataUrl);
  }

  pendingFile = null;
  pendingFileDataUrl = null;

  attachmentPreviewSlot.style.display = "none";
  attachThumb.src = "";
  attachThumb.style.display = "none";
  attachFileIcon.style.display = "flex";
  attachFileIcon.innerHTML = '<i class="fas fa-file-alt"></i>';
  attachName.textContent = "";
  attachType.textContent = "";
  fileUpload.value = "";

  if (userInput.value.trim() !== "") {
    sendBtn.classList.add("active");
    sendBtn.classList.remove("hidden");
    audioBtn.classList.remove("active");
    audioBtn.classList.add("hidden");
  } else {
    audioBtn.classList.add("active");
    audioBtn.classList.remove("hidden");
    sendBtn.classList.remove("active");
    sendBtn.classList.add("hidden");
  }
}

fileUpload.addEventListener("change", function () {
  const file = fileUpload.files[0];
  if (!file) return;
  showFileChip(file);
});

fileChipRemove.addEventListener("click", function (e) {
  e.stopPropagation();
  clearFileChip();
});

// ===================================
// AUDIO RECORDING
// ===================================

audioBtn.addEventListener("click", function () {
  if (!isRecording) { startRecording(); }
  else { stopRecording(false); }
});

cancelRecording.addEventListener("click", function (e) {
  e.stopPropagation();
  stopRecording(true);
});

// ------- ANKIT ---------
function saveAudioBlob(blob) {
  const request = indexedDB.open("AudioDB", 1);
  request.onupgradeneeded = function (event) {
    event.target.result.createObjectStore("recordings");
  };
  request.onsuccess = function (event) {
    const db = event.target.result;
    const tx = db.transaction("recordings", "readwrite");
    const store = tx.objectStore("recordings");
    store.put(blob, "latestRecording");
    tx.oncomplete = () => { console.log("Audio saved in IndexedDB"); };
  };
}

// ------- ANKIT ---------
function getAudioBlob() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("AudioDB", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = function (event) {
      const db = event.target.result;
      const tx = db.transaction("recordings", "readonly");
      const store = tx.objectStore("recordings");
      const getRequest = store.get("latestRecording");
      getRequest.onsuccess = () => resolve(getRequest.result);
      getRequest.onerror = () => reject(getRequest.error);
    };
  });
}


// ------- ANKIT ---------
// Use this API to fetch the GROQ API KEY from Amazon Lambda (so that we do not expose api key in prod).
async function getApiKey() {
  try {
    const response = await fetch("https://28iqvhtgm1.execute-api.ap-south-1.amazonaws.com/dev/apiKey", {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    return data.api_key;

  } catch (error) {
    console.error("Error fetching GROQ API key:", error);
    throw error;
  }
}


// ------- ANKIT ---------
async function transcribeAudio(blob) {
  try {
    const apiKey = await getApiKey();
    const audioFile = new File([blob], "audio.webm", { type: blob.type || "audio/webm" });
    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("language", "en");
    formData.append("temperature", "0.0");

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData
    });

    const data = await response.json();
    console.log(data);
    return data.text;
  } catch (error) {
    return "❌ Could not process the audio currently.";
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.addEventListener("dataavailable", event => { audioChunks.push(event.data); });
    mediaRecorder.addEventListener("stop", () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      saveAudioBlob(audioBlob);
      mediaRecorder._audioBlob = audioBlob;
    });

    mediaRecorder.start();
    isRecording = true;

    inputWrapper.style.display = "none";
    audioBtn.classList.remove("active");
    audioBtn.classList.add("hidden");
    recordingUI.classList.add("active");

    recordingStartTime = Date.now();
    recordingInterval = setInterval(updateRecordingTimer, 100);

  } catch (error) {
    console.error("Microphone access denied:", error);
    addMessage("❌ Could not access microphone. Please allow microphone permissions.", "bot");
  }
}

async function stopRecording(cancelled = false) {
  if (!isRecording) return;

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }

  isRecording = false;
  clearInterval(recordingInterval);

  recordingUI.classList.remove("active");
  inputWrapper.style.display = "flex";
  audioBtn.classList.add("active");
  audioBtn.classList.remove("hidden");
  recordingTimer.textContent = "0:00";

  userInput.disabled = true;
  audioBtn.disabled = true;
  audioBtn.style.backgroundColor = "red";

  if (!cancelled) {
    resetSessionTimer();
    await requestLocationIfNeeded();

    const waitForBlob = () => new Promise((resolve) => {
      const check = () => {
        if (mediaRecorder && mediaRecorder._audioBlob) { resolve(mediaRecorder._audioBlob); }
        else { setTimeout(check, 50); }
      };
      check();
    });

    const session = await getOrCreateSessionId();
    showTypingIndicator();

    const audioBlob = await waitForBlob();
    let transcribedMsg = await transcribeAudio(audioBlob);
    console.log("Transcribed Msg:", transcribedMsg);

    addMessage(transcribedMsg, "user");

    try {
      const { lat, lng } = getUserLocation();

      const response = await fetch("https://dev-api.cesc.co.in/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "user_id": session.gck,
          "session_id": session.session_id,
          "text": transcribedMsg,
          "document_file_name": "",
          "user_lat": lat,
          "user_long": lng,
          "channel": "WEB"
        })
      });

      const data = await response.json();
      console.log(data);

      removeTypingIndicator();
      if (data && data['reply']) {
        addMessage(data['reply'], "bot");
      } else {
        console.error("No reply in audio response:", data);
        addMessage("❌ No response received. Please try again.", "bot");
      }

      userInput.disabled = false;
      audioBtn.disabled = false;
      audioBtn.style.backgroundColor = COLOR_PRIMARY;

    } catch (error) {
      console.error("Error:", error);
      removeTypingIndicator();
      addMessage("❌ Something went wrong. Please try again.", "bot");
      userInput.disabled = false;
      audioBtn.disabled = false;
      audioBtn.style.backgroundColor = COLOR_PRIMARY;
    }
  } else {
    userInput.disabled = false;
    audioBtn.disabled = false;
    audioBtn.style.backgroundColor = COLOR_PRIMARY;
  }
}

function updateRecordingTimer() {
  const elapsed = Date.now() - recordingStartTime;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  recordingTimer.textContent = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  if (seconds >= 120) stopRecording(false);
}

// Click anywhere on recording UI to stop & send
recordingUI.addEventListener("click", function (e) {
  if (e.target.closest('.cancel-recording')) return;
  if (isRecording) stopRecording(false);
});

// ===================================
// INITIALISE
// ===================================

audioBtn.classList.add("active");
audioBtn.classList.remove("hidden");
sendBtn.classList.remove("active");
sendBtn.classList.add("hidden");

// Initialize SSE connection for real-time outage notifications
initializeSSE();

// Request notification permission (optional)
if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}

console.log("CESC Chatbot initialised — P1 design tokens applied.");
