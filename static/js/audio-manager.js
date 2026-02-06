// FILE: static/js/audio-manager.js

// --- CONFIGURATION ---
const SILENCE_THRESHOLD = 15; 
const SILENCE_DURATION = 1000; 
const MAX_RECORD_TIME = 8000; 

// --- VARIABLES ---
let mediaRecorder = null;
let globalStream = null;
let audioChunks = [];
let micAnalyser, micDataArray, micVisualizerInterval;

// State Variables
let lastSpeechTime = 0;
let recordingStartTime = 0;
let hasSpoken = false; 
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
            micAnalyser.fftSize = 64; 
            source.connect(micAnalyser);
            micDataArray = new Uint8Array(micAnalyser.frequencyBinCount);
            console.log("🎤 Microphone Connected & Ready");
        })
        .catch(console.error);
}

// --- RECORDING LOGIC ---
function startRecording() {
    ensureAudioContext();
    if (window.isServerGenerating) return;
    
    if (window.isSpeaking) {
        forceStopPlayback();
        socket.emit('interrupt_signal');
    }

    if (!globalStream) {
        initMicrophone(); 
        return;
    }

    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();

    let mimeType = 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';

    mediaRecorder = new MediaRecorder(globalStream, { mimeType: mimeType });
    audioChunks = [];

    mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: mimeType });
        console.log(`📦 Recording Stopped. Size: ${audioBlob.size} bytes`);
        
        if (audioBlob.size > 500) {
            window.isServerGenerating = true; 
            setButtonState('THINKING');
            
            // --- TRIGGER VISUAL THINKING ---
            if (window.setThinking) window.setThinking(true); 

            socket.emit('audio_stream', audioBlob);
        } else {
            if(window.conversationMode) setTimeout(startRecording, 500);
            else setButtonState('IDLE');
        }
    };

    recordingStartTime = Date.now();
    lastSpeechTime = Date.now(); 
    hasSpoken = false;
    window.isRecording = true;
    setButtonState('LISTENING');

    mediaRecorder.start(100); 

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

// --- SILENCE MONITOR ---
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

    if (currentVolume > SILENCE_THRESHOLD) {
        if (!hasSpoken) console.log("🗣️ Speech Detected!");
        hasSpoken = true;
        lastSpeechTime = now; 
    }

    if (hasSpoken && (now - lastSpeechTime > SILENCE_DURATION)) {
        stopRecording();
        return;
    }

    if (now - recordingStartTime > MAX_RECORD_TIME) {
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
    
    // Stop thinking if interrupted
    if (window.setThinking) window.setThinking(false);
}

// --- PLAYBACK ---
let audioQueue = [];
let isPlayingSequence = false;
window.currentAudioObj = null;

socket.on('speak_audio_sequence', (playlist) => {
    // --- STOP THINKING WHEN RESPONSE ARRIVES ---
    if (window.setThinking) window.setThinking(false);

    if (window.isRecording) return; 
    window.isSpeaking = true;
    setButtonState('SPEAKING');
    audioQueue = audioQueue.concat(playlist); 
    if (!isPlayingSequence) playNextInQueue();
});

socket.on('ai_response_done', () => {
    window.isServerGenerating = false;
    
    // Just in case (Stop thinking)
    if (window.setThinking) window.setThinking(false);

    if (!isPlayingSequence && audioQueue.length === 0) {
        if (window.conversationMode) {
            setTimeout(startRecording, 200);
        } else {
            setButtonState('IDLE');
        }
    }
});

socket.on('error', (data) => {
    console.error("Server Error:", data);
    window.isServerGenerating = false; 
    if (window.setThinking) window.setThinking(false); // Stop thinking on error
    setButtonState('IDLE');
    if (window.conversationMode) setTimeout(() => startRecording(), 1000);
});

function playNextInQueue() {
    ensureAudioContext();
    if (audioQueue.length === 0) {
        isPlayingSequence = false;
        window.isSpeaking = false;
        
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

    if (currentItem.text) {
        const t = document.getElementById('response-text');
        if(t) { t.innerText = currentItem.text; t.style.display = 'block'; }
    }
    if (currentItem.emotion) triggerExp(currentItem.emotion);

    if (currentItem.audio) {
        const audio = new Audio(currentItem.audio);
        audio.crossOrigin = 'anonymous';
        window.currentAudioObj = audio; 
        
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

window.startRecording = startRecording;
window.stopRecording = stopRecording;
window.initMicrophone = initMicrophone;
window.setButtonState = setButtonState;
window.addEventListener('load', initMicrophone);