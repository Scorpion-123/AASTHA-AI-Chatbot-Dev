// ===================================
// CESC CHATBOT — JavaScript Logic
// ===================================

// DOM Elements
const chatBubble      = document.getElementById("chatBubble");
const chatbot         = document.getElementById("chatbot");
const closeBtn        = document.getElementById("closeBtn");
const minimizeBtn     = document.getElementById("minimizeBtn");
const userInput       = document.getElementById("userInput");
const sendBtn         = document.getElementById("sendBtn");
const audioBtn        = document.getElementById("audioBtn");
const chatBody        = document.getElementById("chatBody");
const fileUpload      = document.getElementById("fileUpload");
const recordingUI     = document.getElementById("recordingUI");
const inputWrapper    = document.getElementById("inputWrapper");
const cancelRecording = document.getElementById("cancelRecording");
const recordingTimer  = document.getElementById("recordingTimer");
const fileChipRemove  = document.getElementById("fileChipRemove");

// Attachment preview slot elements
const attachmentPreviewSlot = document.getElementById("attachmentPreviewSlot");
const attachThumb           = document.getElementById("attachThumb");
const attachFileIcon        = document.getElementById("attachFileIcon");
const attachName            = document.getElementById("attachName");
const attachType            = document.getElementById("attachType");

// State
let isRecording        = false;
let recordingInterval  = null;
let recordingStartTime = 0;
let mediaRecorder      = null;
let audioChunks        = [];
let pendingFile        = null;
let pendingFileDataUrl = null;

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

// ===================================
// MESSAGE HANDLING
// ===================================

function addMessage(text, sender) {
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message", sender);

  const messageContent = document.createElement("div");
  messageContent.classList.add("message-content");

  let formattedText = text
    .replace(/\\n/g, '\n')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\(CID:\s*(\d+)\)/g, '<strong>(CID: $1)</strong>')
    .replace(/CID:\s*(\d+)/g, '<strong>CID: $1</strong>')
    .replace(/\n/g, '<br>');

  if (sender === "bot") {
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    const linkedText = formattedText.replace(urlRegex, url => {
      const cleanUrl = url.replace(/(<br>|<[^>]+>)+$/g, '').replace(/[.,;!?]+$/, '');
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer"
                 style="color:#0056B3;text-decoration:underline;">Click Here</a>`;
    });
    messageContent.innerHTML = linkedText;
  } else {
    messageContent.innerHTML = formattedText;
  }

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
  const ext = file.name.split(".").pop().toUpperCase();

  if (isImage && dataUrl) {
    const thumb = document.createElement("img");
    thumb.src = dataUrl;
    thumb.alt = file.name;
    thumb.classList.add("sent-attach-thumb-img");
    card.appendChild(thumb);
  } else {
    const banner = document.createElement("div");
    banner.classList.add("sent-attach-icon-banner");
    banner.innerHTML = '<i class="fas fa-file-alt"></i>';
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
    session = { "gck": "test_user", "session_id": crypto.randomUUID() };
    localStorage.setItem("session", JSON.stringify(session));
  }
  return session;
}

// ===================================
// SEND MESSAGE
// ===================================

async function sendMessage() {
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

  userInput.value    = "";
  userInput.disabled = true;
  audioBtn.disabled  = true;
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
      audioBtn.disabled  = false;
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

    const response = await fetch("https://api.cesc.co.in/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "user_id":            session.gck,
        "session_id":         session.session_id,
        "text":               hasText ? message : `[File: ${uploadedFileName}]`,
        "document_file_name": file_name,
        "user_lat":           lat,
        "user_long":          lng,
        "channel":            "WEB"
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log("API Response:", data);

    removeTypingIndicator();

    if (data && data['reply']) {
      addMessage(data['reply'], "bot");
    } else {
      console.error("No reply in response:", data);
      addMessage("❌ No response received from server. Please try again.", "bot");
    }

    userInput.disabled = false;
    audioBtn.disabled  = false;
    audioBtn.style.backgroundColor = COLOR_PRIMARY;

  } catch (error) {
    console.error("Error:", error);
    removeTypingIndicator();
    addMessage("❌ Something went wrong. Please try again.", "bot");
    userInput.disabled = false;
    audioBtn.disabled  = false;
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

  if (file.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.onload = (e) => {
      pendingFileDataUrl          = e.target.result;
      attachThumb.src             = e.target.result;
      attachThumb.style.display   = "block";
      attachFileIcon.style.display = "none";
    };
    reader.readAsDataURL(file);
  } else {
    pendingFileDataUrl             = null;
    attachThumb.style.display      = "none";
    attachFileIcon.style.display   = "flex";
  }

  attachmentPreviewSlot.style.display = "block";

  sendBtn.classList.add("active");
  sendBtn.classList.remove("hidden");
  audioBtn.classList.remove("active");
  audioBtn.classList.add("hidden");
}

function clearFileChip() {
  pendingFile        = null;
  pendingFileDataUrl = null;

  attachmentPreviewSlot.style.display = "none";
  attachThumb.src              = "";
  attachThumb.style.display    = "none";
  attachFileIcon.style.display = "flex";
  attachName.textContent       = "";
  attachType.textContent       = "";
  fileUpload.value             = "";

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
  else              { stopRecording(false); }
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
    const db    = event.target.result;
    const tx    = db.transaction("recordings", "readwrite");
    const store = tx.objectStore("recordings");
    store.put(blob, "latestRecording");
    tx.oncomplete = () => { console.log("Audio saved in IndexedDB"); };
  };
}

// ------- ANKIT ---------
function getAudioBlob() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("AudioDB", 1);
    request.onerror   = () => reject(request.error);
    request.onsuccess = function (event) {
      const db         = event.target.result;
      const tx         = db.transaction("recordings", "readonly");
      const store      = tx.objectStore("recordings");
      const getRequest = store.get("latestRecording");
      getRequest.onsuccess = () => resolve(getRequest.result);
      getRequest.onerror   = () => reject(getRequest.error);
    };
  });
}

// ------- ANKIT ---------
async function transcribeAudio(blob) {
  try {
    const apiKey   = "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";
    const audioFile = new File([blob], "audio.webm", { type: blob.type || "audio/webm" });
    const formData  = new FormData();
    formData.append("file",        audioFile);
    formData.append("model",       "whisper-large-v3-turbo");
    formData.append("language",    "en");
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
    audioChunks   = [];

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
    recordingInterval  = setInterval(updateRecordingTimer, 100);

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
  audioBtn.disabled  = true;
  audioBtn.style.backgroundColor = "red";

  if (!cancelled) {
    await requestLocationIfNeeded();

    const waitForBlob = () => new Promise((resolve) => {
      const check = () => {
        if (mediaRecorder && mediaRecorder._audioBlob) { resolve(mediaRecorder._audioBlob); }
        else { setTimeout(check, 50); }
      };
      check();
    });

    const session    = await getOrCreateSessionId();
    showTypingIndicator();

    const audioBlob      = await waitForBlob();
    let transcribedMsg   = await transcribeAudio(audioBlob);
    console.log("Transcribed Msg:", transcribedMsg);

    addMessage(transcribedMsg, "user");

    try {
      const { lat, lng } = getUserLocation();

      const response = await fetch("https://api.cesc.co.in/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "user_id":            session.gck,
          "session_id":         session.session_id,
          "text":               transcribedMsg,
          "document_file_name": "",
          "user_lat":           lat,
          "user_long":          lng,
          "channel":            "WEB"
        })
      });

      const data = await response.json();
      console.log(data);

      removeTypingIndicator();
      addMessage(data['reply'], "bot");

      userInput.disabled = false;
      audioBtn.disabled  = false;
      audioBtn.style.backgroundColor = COLOR_PRIMARY;

    } catch (error) {
      console.error("Error:", error);
      removeTypingIndicator();
      addMessage("❌ Something went wrong. Please try again.", "bot");
      userInput.disabled = false;
      audioBtn.disabled  = false;
      audioBtn.style.backgroundColor = COLOR_PRIMARY;
    }
  } else {
    userInput.disabled = false;
    audioBtn.disabled  = false;
    audioBtn.style.backgroundColor = COLOR_PRIMARY;
  }
}

function updateRecordingTimer() {
  const elapsed          = Date.now() - recordingStartTime;
  const seconds          = Math.floor(elapsed / 1000);
  const minutes          = Math.floor(seconds / 60);
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

console.log("CESC Chatbot initialised — P1 design tokens applied.");
