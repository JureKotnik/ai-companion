// FILE: static/js/audio-manager.js

/* ==========================================================================
   AUDIO MANAGER
   Handles: Microphone Recording, Silence Detection, Socket IO, and Playback
   ========================================================================== */

// --- CONFIGURATION ---
const AUDIO_CONFIG = {
    SILENCE_THRESHOLD: 15,
    SILENCE_DURATION: 1000,
    MAX_RECORD_TIME: 8000,
    VISUALIZER_INTERVAL: 50,
    FFT_SIZE: 256 // For Lip Sync
};

// --- STATE VARIABLES ---
let mediaRecorder = null;
let globalStream = null;
let audioChunks = [];

// NOTE: 'audioContext' and 'analyser' are already declared in globals.js
// We only declare variables specific to the microphone here:
let micAnalyser = null;  // For Visualizer (Input)
let micDataArray = null;
let micVisualizerInterval = null;

// Logic Flags
let lastSpeechTime = 0;
let recordingStartTime = 0;
let hasSpoken = false;
let silenceTimerID = null;

// Playback Queue
let audioQueue = [];
let isPlayingSequence = false;
window.currentAudioObj = null;


/* ==========================================================================
   INITIALIZATION & MICROPHONE
   ========================================================================== */

// Ensure Audio Context exists (Needed for both Mic and Lip Sync)
function ensureAudioContext() {
    // Check global variable from globals.js
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser(); // For Lip Sync
        analyser.fftSize = AUDIO_CONFIG.FFT_SIZE;
        analyser.smoothingTimeConstant = 0.5;
        
        // Ensure global dataArray exists for model-manager.js
        if (!dataArray) {
             dataArray = new Uint8Array(analyser.frequencyBinCount);
        }
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

function initMicrophone() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error("MediaDevices API not supported.");
        return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            globalStream = stream;
            
            // Setup Visualizer (Input)
            ensureAudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            micAnalyser = audioContext.createAnalyser();
            micAnalyser.fftSize = 64;
            source.connect(micAnalyser);
            micDataArray = new Uint8Array(micAnalyser.frequencyBinCount);
            
            console.log("🎤 Microphone Connected & Ready");
        })
        .catch(err => console.error("Microphone Init Error:", err));
}

// Initialize on Load
window.addEventListener('load', initMicrophone);


/* ==========================================================================
   RECORDING LOGIC
   ========================================================================== */

function startRecording() {
    ensureAudioContext();
    
    // Prevent recording if server is processing
    if (window.isServerGenerating) return;
    
    // Interrupt if currently speaking
    if (window.isSpeaking) {
        forceStopPlayback();
        if (typeof socket !== 'undefined') socket.emit('interrupt_signal');
    }

    if (!globalStream) {
        initMicrophone(); 
        return;
    }

    // Reset Recorder
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();

    // Determine Best Codec
    let mimeType = 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
    }

    mediaRecorder = new MediaRecorder(globalStream, { mimeType: mimeType });
    audioChunks = [];

    mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = handleRecordingStop;

    // Update State
    recordingStartTime = Date.now();
    lastSpeechTime = Date.now(); 
    hasSpoken = false;
    window.isRecording = true;
    setButtonState('LISTENING');

    mediaRecorder.start(100); 

    // Start Silence Monitoring
    if (window.conversationMode) {
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

function handleRecordingStop() {
    const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
    console.log(`📦 Recording Stopped. Size: ${audioBlob.size} bytes`);
    
    if (audioBlob.size > 500) {
        window.isServerGenerating = true; 
        setButtonState('THINKING');
        
        // Visual Thinking Trigger
        if (window.setThinking) window.setThinking(true); 

        if (typeof socket !== 'undefined') socket.emit('audio_stream', audioBlob);
    } else {
        // Audio was too short/empty
        if(window.conversationMode) setTimeout(startRecording, 500);
        else setButtonState('IDLE');
    }
}


/* ==========================================================================
   SILENCE MONITOR
   ========================================================================== */

function monitorSilence() {
    if (!window.isRecording || !window.conversationMode) return;

    let currentVolume = 0;
    if (micAnalyser) {
        micAnalyser.getByteFrequencyData(micDataArray);
        let sum = 0;
        for(let i=0; i<micDataArray.length; i++) sum += micDataArray[i];
        currentVolume = sum / micDataArray.length;
    }

    const now = Date.now();

    // Speech Detection
    if (currentVolume > AUDIO_CONFIG.SILENCE_THRESHOLD) {
        if (!hasSpoken) console.log("🗣️ Speech Detected!");
        hasSpoken = true;
        lastSpeechTime = now; 
    }

    // Stop if Silence > Threshold
    if (hasSpoken && (now - lastSpeechTime > AUDIO_CONFIG.SILENCE_DURATION)) {
        stopRecording();
        return;
    }

    // Stop if Max Time Exceeded
    if (now - recordingStartTime > AUDIO_CONFIG.MAX_RECORD_TIME) {
        stopRecording();
        return;
    }

    silenceTimerID = requestAnimationFrame(monitorSilence);
}


/* ==========================================================================
   PLAYBACK & QUEUE
   ========================================================================== */

function forceStopPlayback() {
    if (window.currentAudioObj) {
        window.currentAudioObj.pause();
        window.currentAudioObj = null;
    }
    audioQueue = [];
    isPlayingSequence = false;
    window.isSpeaking = false;
    window.isServerGenerating = false;
    
    if (window.setThinking) window.setThinking(false);
}

// Socket Event Listeners
if (typeof socket !== 'undefined') {
    socket.on('speak_audio_sequence', (playlist) => {
        if (window.setThinking) window.setThinking(false);
        if (window.isRecording) return; 

        window.isSpeaking = true;
        setButtonState('SPEAKING');
        audioQueue = audioQueue.concat(playlist); 
        if (!isPlayingSequence) playNextInQueue();
    });

    socket.on('ai_response_done', () => {
        window.isServerGenerating = false;
        if (window.setThinking) window.setThinking(false);

        if (!isPlayingSequence && audioQueue.length === 0) {
            if (window.conversationMode) setTimeout(startRecording, 200);
            else setButtonState('IDLE');
        }
    });

    socket.on('error', (data) => {
        console.error("Server Error:", data);
        window.isServerGenerating = false; 
        if (window.setThinking) window.setThinking(false);
        setButtonState('IDLE');
        if (window.conversationMode) setTimeout(startRecording, 1000);
    });
}

function playNextInQueue() {
    ensureAudioContext();
    
    if (audioQueue.length === 0) {
        isPlayingSequence = false;
        window.isSpeaking = false;
        
        if (!window.isServerGenerating) {
            if (window.conversationMode) setTimeout(startRecording, 200);
            else setButtonState('IDLE');
        }
        return;
    }

    isPlayingSequence = true;
    window.isSpeaking = true;
    const currentItem = audioQueue.shift(); 

    // Update UI
    if (currentItem.text) {
        const t = document.getElementById('response-text');
        if(t) { t.innerText = currentItem.text; t.style.display = 'block'; }
    }
    
    // Trigger Expression/Mood
    if (currentItem.emotion && typeof triggerExp === 'function') {
        triggerExp(currentItem.emotion);
    }

    // Play Audio
    if (currentItem.audio) {
        const audio = new Audio(currentItem.audio);
        audio.crossOrigin = 'anonymous';
        window.currentAudioObj = audio; 
        
        // Lip Sync Connection
        if(audioContext && analyser) {
            const source = audioContext.createMediaElementSource(audio);
            source.connect(analyser); 
            source.connect(audioContext.destination); 
        } else {
            console.warn("AudioContext missing, lip sync may fail");
        }

        audio.play().catch(console.error);
        
        audio.onended = () => {
            if (typeof socket !== 'undefined') {
                socket.emit('delete_audio', { filename: currentItem.audio });
            }
            playNextInQueue();
        };
    } else {
        setTimeout(playNextInQueue, 100);
    }
}


/* ==========================================================================
   UI HELPERS
   ========================================================================== */

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
        
        let glow = Math.min(255, avg * 2.5);
        if (btn.innerText.includes("Listening")) {
            btn.style.boxShadow = `0 0 ${avg}px rgb(${255-glow}, ${glow + 50}, 50)`;
            btn.style.borderColor = `rgb(${255-glow}, ${glow + 50}, 50)`;
        }
    }, AUDIO_CONFIG.VISUALIZER_INTERVAL);
}

// --- GLOBAL EXPORTS ---
window.startRecording = startRecording;
window.stopRecording = stopRecording;
window.initMicrophone = initMicrophone;
window.setButtonState = setButtonState;
window.forceStopPlayback = forceStopPlayback;