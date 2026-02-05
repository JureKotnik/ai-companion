// FILE: static/js/audio-manager.js

// --- LOCAL VARIABLES (Internal use only) ---
let mediaRecorder;
let audioChunks = [];
let micAnalyser, micDataArray, micVisualizerInterval;

// Silence Detection Counters
let speakingFrameCount = 0;
let silenceFrameCount = 0;
let recordingStartTime = 0;
let silenceLoopActive = false;

// NOTE: isRecording, isSpeaking, etc. are now inherited from globals.js

// --- UI HELPER: BUTTON STATE ---
function setButtonState(state) {
    const btn = document.getElementById('mic-btn');
    if (!btn) return;

    clearInterval(micVisualizerInterval);
    btn.style.boxShadow = "none";
    btn.style.borderColor = "";
    btn.classList.remove('listening');

    switch (state) {
        case 'IDLE':
            btn.innerText = "Hold SPACE to Speak";
            btn.style.background = "";
            btn.disabled = false;
            break;
        case 'LISTENING':
            btn.innerText = conversationMode ? "Listening (Auto)..." : "Listening...";
            btn.classList.add('listening');
            btn.style.background = "#ff4b4b"; 
            btn.disabled = false;
            startVisualizer(btn);
            break;
        case 'THINKING':
            btn.innerText = "Thinking...";
            btn.style.background = "#555"; 
            btn.style.color = "#ddd";
            btn.disabled = true;
            break;
        case 'SPEAKING':
            btn.innerText = "AI Speaking...";
            btn.style.background = "#222"; 
            btn.style.color = "#fff";
            btn.disabled = true;
            break;
        case 'ERROR':
            btn.innerText = "??";
            btn.style.background = "darkred";
            break;
    }
}

function startVisualizer(btn) {
    if (!micAnalyser) return;
    micVisualizerInterval = setInterval(() => {
        micAnalyser.getByteFrequencyData(micDataArray);
        let sum = 0;
        for(let i=0; i<micDataArray.length; i++) sum += micDataArray[i];
        let avg = sum / micDataArray.length;
        let glow = Math.min(255, avg * 2.5);
        if (btn.innerText.includes("Listening")) {
            btn.style.boxShadow = `0 0 ${avg}px rgb(${255-glow}, ${glow + 50}, 50)`;
            btn.style.borderColor = `rgb(${255-glow}, ${glow + 50}, 50)`;
        }
    }, 50);
}

// --- MICROPHONE SETUP ---
function initMicrophone() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const btn = document.getElementById('mic-btn');
        if(btn) btn.innerText = "Mic Not Supported";
        return;
    }

    let mimeType = 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
            
            const micCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = micCtx.createMediaStreamSource(stream);
            micAnalyser = micCtx.createAnalyser();
            micAnalyser.fftSize = 64;
            source.connect(micAnalyser);
            micDataArray = new Uint8Array(micAnalyser.frequencyBinCount);

            mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                handleRecordingStop(mimeType);
            };
        })
        .catch(err => {
            console.error("Mic Error:", err);
            const btn = document.getElementById('mic-btn');
            if(btn) btn.innerText = "Mic Error";
        });
}

function handleRecordingStop(mimeType) {
    const audioBlob = new Blob(audioChunks, { type: mimeType });
    audioChunks = []; 
    isRecording = false; 

    // Ignore short audio (< 0.8s)
    if (audioBlob.size < 25000) {
        console.warn(`⚠️ Short audio ignored (${audioBlob.size}b)`);
        if (conversationMode && !isSpeaking && !isServerGenerating) {
            startRecording();
        } else {
            setButtonState('IDLE');
        }
        return;
    }

    console.log(`🎤 Sending ${audioBlob.size} bytes`);
    
    // LOCK THE UI
    isServerGenerating = true; 
    setButtonState('THINKING');
    
    socket.emit('audio_stream', audioBlob);
}

function startRecording() {
    ensureAudioContext();
    
    // STRICT LOCKS
    if (isSpeaking) { console.log("🛑 Blocked: AI Speaking"); return; }
    if (isServerGenerating) { console.log("🛑 Blocked: AI Generating"); return; }

    if (mediaRecorder && mediaRecorder.state === "inactive") {
        audioChunks = [];
        speakingFrameCount = 0;
        silenceFrameCount = 0;
        recordingStartTime = Date.now();

        mediaRecorder.start(100); 
        isRecording = true; 
        setButtonState('LISTENING');

        if (conversationMode && !silenceLoopActive) {
            silenceLoopActive = true;
            requestAnimationFrame(silenceLoop);
        }
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
    }
}

// --- SILENCE DETECTION ---
function silenceLoop() {
    if (!conversationMode || !isRecording) {
        silenceLoopActive = false;
        return;
    }
    
    if (isSpeaking || isServerGenerating) {
        stopRecording();
        return;
    }

    // Grace Period: 3.0 seconds
    if (Date.now() - recordingStartTime < 3000) {
        requestAnimationFrame(silenceLoop);
        return;
    }

    if (micAnalyser) {
        const data = new Uint8Array(micAnalyser.frequencyBinCount);
        micAnalyser.getByteFrequencyData(data);
        let sum = 0;
        for(let i=0; i<data.length; i++) sum += data[i];
        let average = sum / data.length;

        if (average > 15) {
            speakingFrameCount++; 
            silenceFrameCount = 0; 
        } else if (speakingFrameCount > 10) { 
            silenceFrameCount++;
        }
        
        if (silenceFrameCount > 90) { 
            console.log("🤖 Silence Auto-Stop");
            stopRecording(); 
        }
    }
    requestAnimationFrame(silenceLoop);
}

// --- PLAYBACK QUEUE ---
let audioQueue = [];
let isPlayingSequence = false;

socket.on('speak_audio_sequence', (playlist) => {
    isSpeaking = true;
    stopRecording(); 
    setButtonState('SPEAKING');

    if (typeof resetIdleTimer === "function") resetIdleTimer();
    audioQueue = audioQueue.concat(playlist); 
    if (!isPlayingSequence) playNextInQueue();
});

// 2. SUCCESS: Server is done
socket.on('ai_response_done', () => {
    console.log("✅ Server finished generating.");
    isServerGenerating = false; 
    
    if (!isPlayingSequence && audioQueue.length === 0) {
        if (conversationMode) {
             startRecording();
        } else {
             setButtonState('IDLE');
        }
    }
});

// 3. ERROR: Server failed (Fixes Softlock)
socket.on('error', (data) => {
    console.error("Server Error:", data);
    
    // CRITICAL FIX: Unlock the state!
    isServerGenerating = false; 
    
    setButtonState('ERROR');

    // Auto-recover after 2 seconds
    setTimeout(() => {
        if (conversationMode) {
            startRecording();
        } else {
            setButtonState('IDLE');
        }
    }, 2000);
});

function playNextInQueue() {
    ensureAudioContext();
    
    if (audioQueue.length === 0) {
        isPlayingSequence = false;
        isSpeaking = false; 

        if (isServerGenerating) {
            setButtonState('THINKING');
            return;
        }

        if (conversationMode) {
            setTimeout(() => { startRecording(); }, 200);
        } else {
            setButtonState('IDLE');
        }
        return;
    }

    isPlayingSequence = true;
    isSpeaking = true;
    const currentItem = audioQueue.shift(); 

    if (currentItem.text) {
        const t = document.getElementById('response-text');
        if(t) { t.innerText = currentItem.text; t.style.display = 'block'; }
    }
    if (currentItem.emotion) triggerExp(currentItem.emotion);

    if (currentItem.audio) {
        const audio = new Audio(currentItem.audio);
        audio.crossOrigin = 'anonymous';
        if(audioContext) {
            const source = audioContext.createMediaElementSource(audio);
            source.connect(analyser); 
            source.connect(audioContext.destination); 
        }
        audio.play().catch(console.error);
        audio.onended = () => {
            socket.emit('delete_audio', { filename: currentItem.audio });
            setTimeout(() => { playNextInQueue(); }, 150); 
        };
    } else {
        setTimeout(() => { playNextInQueue(); }, 1500);
    }
}

// EXPORT TO WINDOW (Allows UI Handler to see these)
window.startRecording = startRecording;
window.stopRecording = stopRecording;
window.setButtonState = setButtonState;
window.initMicrophone = initMicrophone;

window.addEventListener('load', initMicrophone);