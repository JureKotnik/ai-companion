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