// FILE: static/js/audio-manager.js

// --- CONFIGURATION ---
const SILENCE_THRESHOLD = 15; // Volume level to consider "Silence" (0-255)
const SILENCE_DURATION = 1000; // How long to wait after speech stops (ms)
const MAX_RECORD_TIME = 8000; // Force stop after 8 seconds

// --- VARIABLES ---
let mediaRecorder = null;
let globalStream = null;
let audioChunks = [];
let micAnalyser, micDataArray, micVisualizerInterval;

// State Variables
let lastSpeechTime = 0;
let recordingStartTime = 0;
let hasSpoken = false; // Did we hear the user speak yet?
let silenceTimerID = null;

// --- UI HELPERS ---
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
            btn.innerText = window.conversationMode ? "Listening..." : "Listening...";
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
            btn.innerText = "Space to Interrupt";
            btn.style.background = "#222"; 
            btn.style.color = "#fff";
            btn.disabled = false; 
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
        
        // Visual Glow
        let glow = Math.min(255, avg * 2.5);
        if (btn.innerText.includes("Listening")) {
            btn.style.boxShadow = `0 0 ${avg}px rgb(${255-glow}, ${glow + 50}, 50)`;
            btn.style.borderColor = `rgb(${255-glow}, ${glow + 50}, 50)`;
        }
    }, 50);
}

// --- MICROPHONE SETUP ---
function initMicrophone() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            globalStream = stream;
            
            const micCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = micCtx.createMediaStreamSource(stream);
            micAnalyser = micCtx.createAnalyser();
            micAnalyser.fftSize = 64; // Low detail for performance
            source.connect(micAnalyser);
            micDataArray = new Uint8Array(micAnalyser.frequencyBinCount);
            
            console.log("🎤 Microphone Connected & Ready");
        })
        .catch(console.error);
}

// --- RECORDING LOGIC ---

function startRecording() {
    ensureAudioContext();
    
    // Safety: Don't start if AI is processing
    if (window.isServerGenerating) {
        console.warn("⚠️ Cannot listen: AI is thinking.");
        return;
    }
    
    // Interrupt: If AI is talking, shut it up
    if (window.isSpeaking) {
        forceStopPlayback();
        socket.emit('interrupt_signal');
    }

    if (!globalStream) {
        console.error("❌ No Microphone Stream!");
        initMicrophone(); // Try to reconnect
        return;
    }

    // 1. CLEANUP OLD RECORDER
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    // 2. SETUP NEW RECORDER
    let mimeType = 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
    }

    mediaRecorder = new MediaRecorder(globalStream, { mimeType: mimeType });
    audioChunks = [];

    mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
        // This runs when we explicitly call .stop()
        const audioBlob = new Blob(audioChunks, { type: mimeType });
        console.log(`📦 Recording Stopped. Size: ${audioBlob.size} bytes`);
        
        // Only send if we actually have data and it's not microscopic
        if (audioBlob.size > 500) {
            window.isServerGenerating = true; 
            setButtonState('THINKING');
            socket.emit('audio_stream', audioBlob);
        } else {
            console.warn("⚠️ Audio too short/empty. Ignoring.");
            // If in auto mode, try listening again shortly
            if(window.conversationMode) setTimeout(startRecording, 500);
            else setButtonState('IDLE');
        }
    };

    // 3. RESET STATE
    recordingStartTime = Date.now();
    lastSpeechTime = Date.now(); // Reset timer to now
    hasSpoken = false;
    window.isRecording = true;
    setButtonState('LISTENING');

    mediaRecorder.start(100); 

    // 4. START MONITORING LOOP
    if (window.conversationMode) {
        console.log("👂 Auto-Listening Started...");
        cancelAnimationFrame(silenceTimerID);
        silenceTimerID = requestAnimationFrame(monitorSilence);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        window.isRecording = false;
        cancelAnimationFrame(silenceTimerID);
    }
}

// --- NEW MONITORING LOGIC (Time-Based) ---
function monitorSilence() {
    if (!window.isRecording || !window.conversationMode) return;

    // A. Check Volume
    let currentVolume = 0;
    if (micAnalyser) {
        micAnalyser.getByteFrequencyData(micDataArray);
        let sum = 0;
        for(let i=0; i<micDataArray.length; i++) sum += micDataArray[i];
        currentVolume = sum / micDataArray.length;
    }

    const now = Date.now();

    // B. Logic
    if (currentVolume > SILENCE_THRESHOLD) {
        // User is talking
        if (!hasSpoken) console.log("🗣️ Speech Detected!");
        hasSpoken = true;
        lastSpeechTime = now; // Reset the "silence clock"
    }

    // C. Check for Silence Timeout (Only if they have spoken already)
    if (hasSpoken && (now - lastSpeechTime > SILENCE_DURATION)) {
        console.log("🤫 Silence detected (1s). Stopping.");
        stopRecording();
        return;
    }

    // D. Check for Max Duration (Force stop after 8s even if noisy)
    if (now - recordingStartTime > MAX_RECORD_TIME) {
        console.log("⏰ Max recording time reached.");
        stopRecording();
        return;
    }

    silenceTimerID = requestAnimationFrame(monitorSilence);
}

function forceStopPlayback() {
    if (window.currentAudioObj) {
        window.currentAudioObj.pause();
        window.currentAudioObj = null;
    }
    audioQueue = [];
    isPlayingSequence = false;
    window.isSpeaking = false;
    window.isServerGenerating = false;
}

// --- PLAYBACK ---
let audioQueue = [];
let isPlayingSequence = false;
window.currentAudioObj = null;

socket.on('speak_audio_sequence', (playlist) => {
    if (window.isRecording) return; 
    window.isSpeaking = true;
    setButtonState('SPEAKING');
    audioQueue = audioQueue.concat(playlist); 
    if (!isPlayingSequence) playNextInQueue();
});

socket.on('ai_response_done', () => {
    window.isServerGenerating = false;
    console.log("✅ AI Response Complete.");
    
    // Only restart listening if we are done playing audio
    if (!isPlayingSequence && audioQueue.length === 0) {
        if (window.conversationMode) {
            console.log("🔄 Restarting Listener in 200ms...");
            setTimeout(startRecording, 200);
        } else {
            setButtonState('IDLE');
        }
    }
});

function playNextInQueue() {
    ensureAudioContext();
    if (audioQueue.length === 0) {
        isPlayingSequence = false;
        window.isSpeaking = false;
        
        // If the AI is done generating AND done speaking -> Listen again
        if (!window.isServerGenerating) {
            if (window.conversationMode) {
                setTimeout(startRecording, 200);
            } else {
                setButtonState('IDLE');
            }
        }
        return;
    }

    isPlayingSequence = true;
    window.isSpeaking = true;
    const currentItem = audioQueue.shift(); 

    // UI Updates
    if (currentItem.text) {
        const t = document.getElementById('response-text');
        if(t) { t.innerText = currentItem.text; t.style.display = 'block'; }
    }
    if (currentItem.emotion) triggerExp(currentItem.emotion);

    // Audio Playback
    if (currentItem.audio) {
        const audio = new Audio(currentItem.audio);
        audio.crossOrigin = 'anonymous';
        window.currentAudioObj = audio; 
        
        // Lip Sync Connect
        if(audioContext) {
            const source = audioContext.createMediaElementSource(audio);
            source.connect(analyser); 
            source.connect(audioContext.destination); 
        }

        audio.play().catch(console.error);
        audio.onended = () => {
            socket.emit('delete_audio', { filename: currentItem.audio });
            playNextInQueue();
        };
    } else {
        setTimeout(playNextInQueue, 100);
    }
}

// --- INIT ---
window.startRecording = startRecording;
window.stopRecording = stopRecording;
window.initMicrophone = initMicrophone;
window.setButtonState = setButtonState;
window.addEventListener('load', initMicrophone);