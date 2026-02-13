// FILE: static/js/ui-handler.js

function setMode(mode) {
    if(typeof ensureAudioContext === 'function') ensureAudioContext();
    
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.mode-btn[onclick="setMode('${mode}')"]`).classList.add('active');
    
    document.getElementById('text-area').className = mode === 'text' ? 'visible' : '';
    document.getElementById('voice-area').className = mode === 'voice' ? 'visible' : '';
}

function sendText() {
    if(typeof ensureAudioContext === 'function') ensureAudioContext();
    const input = document.getElementById('msg-input');
    if(!input.value) return;
    
    // Set Global Flags
    window.isServerGenerating = true; 
    if(window.setButtonState) window.setButtonState('THINKING');
    
    if (typeof resetIdleTimer === "function") resetIdleTimer();
    
    socket.emit('user_message', { message: input.value });
    input.value = '';
    document.getElementById('response-text').style.display = 'none';
}

function toggleConversationMode() {
    // Toggle Global Variable
    window.conversationMode = !window.conversationMode;
    const btn = document.getElementById('auto-mode-btn');
    
    if (window.conversationMode) {
        btn.innerText = "🔄 Auto-Chat: ON";
        btn.style.background = "#00cc00"; 
        console.log("Conversation Mode Started");
        if(window.startRecording) window.startRecording(); 
    } else {
        btn.innerText = "🔄 Auto-Chat: OFF";
        btn.style.background = "#444"; 
        console.log("Conversation Mode Stopped");
        
        if(window.stopRecording) window.stopRecording(); 
        
        // Reset Globals
        window.isServerGenerating = false;
        window.isSpeaking = false;
        if(window.setButtonState) window.setButtonState('IDLE');
    }
}

// --- EVENT LISTENERS ---
document.getElementById('msg-input').addEventListener('keypress', (e) => { 
    if(e.key==='Enter') sendText(); 
});

window.addEventListener('keydown', (e) => {
    if (document.activeElement.id !== 'msg-input') {
        if (e.code === 'Space' && !e.repeat && !window.conversationMode) {
            if(window.startRecording) window.startRecording();
        }
    }
});

window.addEventListener('keyup', (e) => {
    if (document.activeElement.id !== 'msg-input') {
        if (e.code === 'Space' && !window.conversationMode) {
            if(window.stopRecording) window.stopRecording();
        }
    }
});

const micBtn = document.getElementById('mic-btn');
if(micBtn) {
    micBtn.addEventListener('mousedown', () => { 
        if(!window.conversationMode && window.startRecording) window.startRecording(); 
    });
    micBtn.addEventListener('mouseup', () => { 
        if(!window.conversationMode && window.stopRecording) window.stopRecording(); 
    });
    micBtn.addEventListener('mouseleave', () => { 
        if(!window.conversationMode && window.stopRecording) window.stopRecording(); 
    });
}

// --- SCREEN SHARING LOGIC ---
let screenStream = null;
let screenInterval = null;
const SCREEN_UPDATE_RATE = 30000; // Check screen every 10 seconds

async function toggleScreenShare() {
    const btn = document.getElementById('screen-btn');
    
    if (!screenStream) {
        // START SHARING
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ 
                video: { cursor: "always" }, 
                audio: false,
            });
            
            // 🆕 TELL SERVER TO STOP RANDOM TALKING
            socket.emit('start_screen_share');

            btn.innerText = "🖥️ Stop Watching";
            btn.classList.add('active');
            btn.style.background = "#00d2ff";
            btn.style.color = "#000";

            // Create hidden video element to read frames
            const video = document.createElement('video');
            video.srcObject = screenStream;
            video.play();

            setTimeout(() => captureAndSend(video), 2000);

            // Loop to send frames
            screenInterval = setInterval(() => {
                // Only send if she isn't currently talking
                if (!window.isSpeaking && !window.isServerGenerating) {
                    captureAndSend(video);
                }
            }, SCREEN_UPDATE_RATE);

            // Handle user clicking "Stop Sharing" on browser UI
            screenStream.getVideoTracks()[0].onended = () => {
                stopScreenShare();
            };

        } catch (err) {
            console.error("Error starting screen share:", err);
        }
    } else {
        // STOP SHARING
        stopScreenShare();
    }
}

function captureAndSend(video) {
    const canvas = document.createElement('canvas');
    
    // UPDATED: Increased resolution to 1280x720 (720p)
    // This allows LLaVA to read text and code much better than 360p.
    canvas.width = 1280; 
    canvas.height = 720;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // UPDATED: Quality 0.8 (Higher quality for text readability)
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    
    socket.emit('screen_update', { image: imageData });
    console.log("📤 Sent High-Res Screen Snapshot");
}

function stopScreenShare() {
    // 🆕 TELL SERVER IT CAN TALK AGAIN
    socket.emit('stop_screen_share');

    const btn = document.getElementById('screen-btn');
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    if (screenInterval) {
        clearInterval(screenInterval);
        screenInterval = null;
    }
    
    if(btn) {
        btn.innerText = "🖥️ Watch Screen";
        btn.classList.remove('active');
        btn.style.background = "";
        btn.style.color = "";
    }
}