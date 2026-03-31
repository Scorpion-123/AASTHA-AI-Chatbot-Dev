// ===================================
// CESC CHATBOT - JavaScript Logic
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
const filePreviewBar = document.getElementById("filePreviewBar");
const filePreviewName = document.getElementById("filePreviewName");
const fileChipRemove = document.getElementById("fileChipRemove");

// State Management
let isRecording = false;
let recordingInterval = null;
let recordingStartTime = 0;
let mediaRecorder = null;
let audioChunks = [];
let pendingFile = null; // File staged for upload, waiting for Send press

// --------------------- ANKIT --------------------- 
// ===================================
// LOCATION PERMISSION (one-time, on first message)
// ===================================

/**
 * Requests geolocation permission exactly once.
 * - If localStorage already has a value (coords or "NA"), resolves immediately.
 * - Otherwise shows the browser permission popup:
 *     Accepted  → stores { lat, lng } in localStorage as JSON.
 *     Rejected  → stores "NA" for both lat and lng.
 * Returns a Promise that always resolves (never rejects) so the chat flow
 * continues regardless of the user's choice.
 */
function requestLocationIfNeeded() {
  return new Promise((resolve) => {
    // Already stored — skip
    if (sessionStorage.getItem("userLat") !== null) {
      resolve();
      return;
    }

    else {
      if (!navigator.geolocation) {
        // Browser doesn't support geolocation
        sessionStorage.setItem("userLat", "NA");
        sessionStorage.setItem("userLng", "NA");
        resolve();
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          // User accepted
          sessionStorage.setItem("userLat", position.coords.latitude);
          sessionStorage.setItem("userLng", position.coords.longitude);
          console.log("Location stored:", position.coords.latitude, position.coords.longitude);
          resolve();
        },
        () => {
          // User rejected / error
          sessionStorage.setItem("userLat", "NA");
          sessionStorage.setItem("userLng", "NA");
          console.log("Location denied — stored NA");
          resolve();
        }
      );
    }
  });
}

/**
 * Reads the stored user coordinates from sessionStorage.
 * Returns { lat, lng } where each value is either a number or "NA".
 * Call this right before every backend API request.
 */
function getUserLocation() {
  const lat = sessionStorage.getItem("userLat") ?? "NA";
  const lng = sessionStorage.getItem("userLng") ?? "NA";
  return {
    lat: lat !== "NA" ? parseFloat(lat) : "NA",
    lng: lng !== "NA" ? parseFloat(lng) : "NA"
  };
}

// ===================================
// CHAT BUBBLE & CHATBOT TOGGLE
// ===================================

// Open Chatbot
chatBubble.addEventListener("click", function () {
  chatbot.classList.add("active");
  chatBubble.style.display = "none"; // Hide chat bubble when chatbot opens
  userInput.focus(); // Auto-focus input field
});

// Close Chatbot
closeBtn.addEventListener("click", function () {
  chatbot.classList.remove("active");
  setTimeout(() => {
    chatBubble.style.display = "flex"; // Show chat bubble after animation
  }, 300);
});

// Minimize Chatbot
minimizeBtn.addEventListener("click", function () {
  chatbot.classList.remove("active");
  setTimeout(() => {
    chatBubble.style.display = "flex"; // Show chat bubble after animation
  }, 300);
});

// ===================================
// MESSAGE HANDLING
// ===================================

// Add Message to Chat
function addMessage(text, sender) {
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message", sender);

  const messageContent = document.createElement("div");
  messageContent.classList.add("message-content");

  // Convert Markdown to HTML.
  let formattedText = text
    .replace(/\\n/g, '\n')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\(CID:\s*(\d+)\)/g, '<strong>(CID: $1)</strong>')
    .replace(/CID:\s*(\d+)/g, '<strong>CID: $1</strong>')
    .replace(/\n/g, '<br>');

  // For Processing the URL's
  if (sender === "bot") {
    const urlRegex = /(https?:\/\/[^\s<]+)/g;  // ← Stop matching at < as well
    const linkedText = formattedText.replace(urlRegex, url => {
      const cleanUrl = url.replace(/(<br>|<[^>]+>)+$/g, '').replace(/[.,;!?]+$/, ''); // Strip trailing tags & punctuation
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" style="color:#0066B3;text-decoration:underline;">Click Here</a>`;
    });
    messageContent.innerHTML = linkedText;
  } else {
    messageContent.innerHTML = formattedText;
  }

  // messageContent.textContent = text;

  messageDiv.appendChild(messageContent);
  chatBody.appendChild(messageDiv);

  // Auto-scroll to bottom
  chatBody.scrollTop = chatBody.scrollHeight;
}

// Show Typing Indicator
function showTypingIndicator() {
  const typingDiv = document.createElement("div");
  typingDiv.classList.add("message", "bot", "typing-indicator-wrapper");
  typingDiv.id = "typingIndicator";

  const typingContent = document.createElement("div");
  typingContent.classList.add("message-content", "typing-indicator");

  // Create three dots
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.classList.add("typing-dot");
    typingContent.appendChild(dot);
  }

  typingDiv.appendChild(typingContent);
  chatBody.appendChild(typingDiv);

  // Auto-scroll to bottom
  chatBody.scrollTop = chatBody.scrollHeight;
}

// Remove Typing Indicator
function removeTypingIndicator() {
  const typingIndicator = document.getElementById("typingIndicator");
  if (typingIndicator) {
    typingIndicator.remove();
  }
}

// ------- ANKIT ---------
// To create a new user_id for every user that is logged in for a current sesison.
function getOrCreateSessionId() {
  let session = JSON.parse(localStorage.getItem("session"));

  if (!session) {
    session = { "gck": "test_user", "session_id": crypto.randomUUID() };
    localStorage.setItem("session", JSON.stringify(session));
  }

  return session;
}

// Send Message
async function sendMessage() {
  const message = userInput.value.trim();
  const hasText = message !== "";
  const hasFile = pendingFile !== null;

  // Nothing to send
  if (!hasText && !hasFile) return;

  // Request location on first message (no-op if already stored)
  await requestLocationIfNeeded();

  // Build user-facing bubble label
  let userLabel = "";
  if (hasFile && hasText) {
    userLabel = `📎 ${pendingFile.name}\n${message}`;
  } else if (hasFile) {
    userLabel = `📎 ${pendingFile.name}`;
  } else {
    userLabel = message;
  }
  addMessage(userLabel, "user");

  userInput.value = "";
  userInput.disabled = true;
  audioBtn.disabled = true;
  audioBtn.style.backgroundColor = "red";

  const fileToUpload = pendingFile;
  clearFileChip();

  // Toggle buttons - show audio, hide send
  sendBtn.classList.remove("active");
  sendBtn.classList.add("hidden");
  audioBtn.classList.add("active");
  audioBtn.classList.remove("hidden");

  // Fetch current session id.
  const session = await getOrCreateSessionId();

  // Show typing indicator
  showTypingIndicator();

  // --- Step 1 (optional): Upload pending file to S3 ---
  let uploadedFileName = ""; // fallback / default
  if (fileToUpload) {
    try {
      const presignedRes = await fetch("https://y3a5w97q7a.execute-api.ap-south-1.amazonaws.com/generate-presigned-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generateUploadUrl",
          fileName: fileToUpload.name,
          fileType: fileToUpload.type,
          userId: session.gck,
          sessionId: session.session_id
        })
      });

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
      return;
    }
  }

  // --- Step 2: Send message to backend ---
  // ----- DO NOT TAMPER CODE -----
  try {

    let file_name = ""
    if (uploadedFileName != "") {
      file_name = `${session.gck}/${session.session_id}/${uploadedFileName}`;
    }

    const { lat, lng } = getUserLocation();
    console.log("Sending with location — lat:", lat, "lng:", lng);

    const body = JSON.stringify({
      "user_id": session.gck,
      "session_id": session.session_id,
      "text": hasText ? message : `[File: ${uploadedFileName}]`,
      "document_file_name": file_name,
      "user_lat": lat,
      "user_long": lng,
      "channel": "WEB"
    });

    const response = await fetch("https://api.cesc.co.in/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log("API Response:", data);

    removeTypingIndicator();

    // Check if reply exists in response
    if (data && data['reply']) {
      addMessage(data['reply'], "bot");
    } else {
      console.error("No reply in response:", data);
      addMessage("❌ No response received from server. Please try again.", "bot");
    }

    userInput.disabled = false;
    audioBtn.disabled = false;
    audioBtn.style.backgroundColor = "#0066B3";


    // const data = await response.json();
    // console.log(data);
    // console.log(data['reply']);

    // removeTypingIndicator();
    // addMessage(data['reply'], "bot");

  } catch (error) {
    console.error("Error:", error);
    removeTypingIndicator();
    addMessage("❌ Something went wrong. Please try again.", "bot");
  }
}

// Send Button Click
sendBtn.addEventListener("click", sendMessage);

// Enter Key to Send
userInput.addEventListener("keypress", function (e) {
  if (e.key === "Enter") {
    sendMessage();
  }
});

// ===================================
// INPUT FIELD - BUTTON TOGGLE
// ===================================

userInput.addEventListener("input", function () {
  if (userInput.value.trim() !== "") {
    // Show send button, hide audio button
    sendBtn.classList.add("active");
    sendBtn.classList.remove("hidden");
    audioBtn.classList.remove("active");
    audioBtn.classList.add("hidden");
  } else {
    // Show audio button, hide send button
    audioBtn.classList.add("active");
    audioBtn.classList.remove("hidden");
    sendBtn.classList.remove("active");
    sendBtn.classList.add("hidden");
  }
});


// ===================================
// FILE UPLOAD HANDLING (deferred — staged until Send is pressed)
// ===================================

// Show a chip in the input area for the staged file
function showFileChip(file) {
  pendingFile = file;
  filePreviewName.textContent = file.name;
  filePreviewBar.style.display = "flex";

  // Always show the Send button when a file is staged
  sendBtn.classList.add("active");
  sendBtn.classList.remove("hidden");
  audioBtn.classList.remove("active");
  audioBtn.classList.add("hidden");
}

// Clear the staged file chip and reset state
function clearFileChip() {
  pendingFile = null;
  filePreviewBar.style.display = "none";
  filePreviewName.textContent = "";
  fileUpload.value = ""; // reset file input so the same file can be re-selected

  // Restore button state based on text input
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

// When user picks a file → stage it, don't upload yet
fileUpload.addEventListener("change", function () {
  const file = fileUpload.files[0];
  if (!file) return;
  showFileChip(file);
});

// Remove-chip button
fileChipRemove.addEventListener("click", function (e) {
  e.stopPropagation();
  clearFileChip();
});

// ===================================
// AUDIO RECORDING
// ===================================

audioBtn.addEventListener("click", function () {
  if (!isRecording) {
    startRecording();
  } else {
    // If already recording, stop and send
    stopRecording(false);
  }
});

cancelRecording.addEventListener("click", function (e) {
  e.stopPropagation(); // Prevent triggering the recording UI click
  stopRecording(true); // true = cancelled
});


// ------- ANKIT ---------
// This is to save the audio file in IndexedDB.
function saveAudioBlob(blob) {
  const request = indexedDB.open("AudioDB", 1);

  request.onupgradeneeded = function (event) {
    const db = event.target.result;
    db.createObjectStore("recordings");
  };

  request.onsuccess = function (event) {
    const db = event.target.result;

    const tx = db.transaction("recordings", "readwrite");
    const store = tx.objectStore("recordings");

    store.put(blob, "latestRecording");

    tx.oncomplete = () => {
      console.log("Audio saved in IndexedDB");
    };
  };
}

// ------- ANKIT ---------
// This is to extract the audio blob from IndexedDB (returns a Promise).
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
// This function is used to perform the Real time "Speech-to-Text" Conversion using GROQ API.
async function transcribeAudio(blob) {

  try {
    const apiKey = "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";

    // Convert blob to file
    const audioFile = new File([blob], "audio.webm", {
      type: blob.type || "audio/webm"
    });

    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("language", "en");
    formData.append("temperature", "0.0");

    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        body: formData
      }
    );

    const data = await response.json();
    console.log(data);
    return data.text;
  }
  catch (error) {
    return "❌ Could not process the audio currently.";
  }
}

async function startRecording() {
  try {

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.addEventListener("dataavailable", event => {
      audioChunks.push(event.data);
    });

    mediaRecorder.addEventListener("stop", () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      saveAudioBlob(audioBlob);
      // Store blob reference directly so stopRecording can access it without
      // a race condition against IndexedDB writes.
      mediaRecorder._audioBlob = audioBlob;
    });

    mediaRecorder.start();
    isRecording = true;

    // UI Changes
    inputWrapper.style.display = "none";
    audioBtn.classList.remove("active");
    audioBtn.classList.add("hidden");
    recordingUI.classList.add("active");

    // Start Timer
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

  // Reset UI
  recordingUI.classList.remove("active");
  inputWrapper.style.display = "flex";
  audioBtn.classList.add("active");
  audioBtn.classList.remove("hidden");
  recordingTimer.textContent = "0:00";

  userInput.disabled = true;
  audioBtn.disabled = true;
  audioBtn.style.backgroundColor = "red";

  if (!cancelled) {
    // Request location on first message (no-op if already stored)
    await requestLocationIfNeeded();

    // The transcribed text will be shown as the user message after transcription.

    // Wait for the mediaRecorder 'stop' event to fire and attach the blob,
    // then retrieve it — avoids the race condition with IndexedDB writes.
    const waitForBlob = () => new Promise((resolve) => {
      const check = () => {
        if (mediaRecorder && mediaRecorder._audioBlob) {
          resolve(mediaRecorder._audioBlob);
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });

    // Session ID to be either created or assigned.
    const session = await getOrCreateSessionId();

    // Show typing indicator
    showTypingIndicator();

    const audioBlob = await waitForBlob();
    console.log("Audio Blob:", audioBlob);

    let transcribedMsg = await transcribeAudio(audioBlob);
    console.log("Transcribed Msg : ", transcribedMsg);

    // Show the transcribed text as the user's voice message bubble
    addMessage(transcribedMsg, "user");

    try {
      const { lat, lng } = getUserLocation();
      console.log("Sending audio with location — lat:", lat, "lng:", lng);

      const response = await fetch("https://api.cesc.co.in/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
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
      console.log(data['reply']);

      removeTypingIndicator();
      addMessage(data['reply'], "bot");


      userInput.disabled = false;
      audioBtn.disabled = false;
      audioBtn.style.backgroundColor = "#0066B3";

    } catch (error) {
      console.error("Error:", error);
    }

  }
}

function updateRecordingTimer() {
  const elapsed = Date.now() - recordingStartTime;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  recordingTimer.textContent = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;

  // Auto-stop after 2 minutes
  if (seconds >= 120) {
    stopRecording(false);
  }
}

// ===================================
// CLICK RECORDING UI TO STOP & SEND
// ===================================

// Click anywhere on recording UI (except delete) to stop and send
recordingUI.addEventListener("click", function (e) {
  // Don't stop if clicking the delete button
  if (e.target.closest('.cancel-recording')) {
    return;
  }

  if (isRecording) {
    stopRecording(false); // Stop and send
  }
});

// ===================================
// INITIALIZE
// ===================================

// Set initial button states
audioBtn.classList.add("active");
audioBtn.classList.remove("hidden");
sendBtn.classList.remove("active");
sendBtn.classList.add("hidden");

console.log("CESC Chatbot initialized successfully!");
