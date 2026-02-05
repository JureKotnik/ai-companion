// UI INTERACTION & EVENTS

function setMode(mode) {
    ensureAudioContext(); // Unlock audio
    
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.mode-btn[onclick="setMode('${mode}')"]`).classList.add('active');
    
    document.getElementById('text-area').className = mode === 'text' ? 'visible' : '';
    document.getElementById('voice-area').className = mode === 'voice' ? 'visible' : '';
}

function sendText() {
    ensureAudioContext();
    const input = document.getElementById('msg-input');
    if(!input.value) return;
    
    if (typeof resetIdleTimer === "function") resetIdleTimer();
    
    socket.emit('user_message', { message: input.value });
    input.value = '';
    document.getElementById('response-text').style.display = 'none';
}

// --- IDLE RESET HOOKS ---
window.addEventListener('mousedown', () => { if (typeof resetIdleTimer === "function") resetIdleTimer(); });
document.getElementById('msg-input').addEventListener('input', () => { if (typeof resetIdleTimer === "function") resetIdleTimer(); });

// --- KEYBOARD LISTENERS ---
document.getElementById('msg-input').addEventListener('keypress', (e) => { 
    if(e.key==='Enter') sendText(); 
});

window.addEventListener('keydown', (e) => {
    // Only record if not typing in the box
    if (document.activeElement.id !== 'msg-input') {
        if (e.code === 'Space' && !e.repeat) startRecording();
    }
});

window.addEventListener('keyup', (e) => {
    if (document.activeElement.id !== 'msg-input') {
        if (e.code === 'Space') stopRecording();
    }
});

// --- MOUSE LISTENERS (MIC BUTTON) ---
const micBtn = document.getElementById('mic-btn');
if(micBtn) {
    micBtn.addEventListener('mousedown', startRecording);
    micBtn.addEventListener('mouseup', stopRecording);
    micBtn.addEventListener('mouseleave', stopRecording);
}

// --- SERVER ERROR HANDLING ---
socket.on('error', (data) => {
    console.error("Server Error:", data);
    const btn = document.getElementById('mic-btn');
    if (btn) {
        btn.innerText = "Error - Try Again";
        btn.style.background = "darkred";
        setTimeout(() => { 
            btn.innerText = "Hold SPACE to Speak"; 
            btn.style.background = "";
        }, 2000);
    }
});