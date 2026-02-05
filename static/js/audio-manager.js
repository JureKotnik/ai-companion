// FILE: static/js/audio-manager.js

// --- VARIABLES ---
let mediaRecorder;
let audioChunks = [];
let micAnalyser, micDataArray, micVisualizerInterval;

// State Variables
let speakingFrameCount = 0;
let silenceFrameCount = 0;
let recordingStartTime = 0;
let silenceLoopActive = false;

// NOTE: Uses globals from globals.js

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
            btn.innerText = window.conversationMode ? "Listening (Auto)..." : "Listening...";
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
        .catch(console.error);
}

function handleRecordingStop(mimeType) {
    const audioBlob = new Blob(audioChunks, { type: mimeType });
    audioChunks = []; 
    window.isRecording = false; 

    // Ignore tiny audio
    if (audioBlob.size < 5000) {
        if (window.conversationMode && !window.isSpeaking) {
             startRecording();
        } else {
             setButtonState('IDLE');
        }
        return;
    }

    console.log(`🎤 Sending ${audioBlob.size} bytes`);
    window.isServerGenerating = true; 
    setButtonState('THINKING');
    socket.emit('audio_stream', audioBlob);
}

function startRecording() {
    ensureAudioContext();
    
    // Interrupt if speaking
    if (window.isSpeaking) {
        forceStopPlayback();
        socket.emit('interrupt_signal');
    }

    if (window.isServerGenerating) return;

    if (mediaRecorder && mediaRecorder.state === "inactive") {
        audioChunks = [];
        speakingFrameCount = 0;
        silenceFrameCount = 0;
        recordingStartTime = Date.now();

        mediaRecorder.start(100); 
        window.isRecording = true; 
        setButtonState('LISTENING');

        if (window.conversationMode && !silenceLoopActive) {
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

function forceStopPlayback() {
    if (window.currentAudioObj) {
        window.currentAudioObj.pause();
        window.currentAudioObj.currentTime = 0;
        window.currentAudioObj = null;
    }
    audioQueue = [];
    isPlayingSequence = false;
    window.isSpeaking = false;
    window.isServerGenerating = false;
}

// --- TUNED SILENCE DETECTION ---
function silenceLoop() {
    if (!window.conversationMode || !window.isRecording) {
        silenceLoopActive = false;
        return;
    }

    const duration = Date.now() - recordingStartTime;

    // Safety: Stop after 8 seconds (was 10)
    if (duration > 8000) {
        stopRecording();
        return;
    }

    // Grace Period: 1.0 second (was 2.5)
    if (duration < 1000) {
        requestAnimationFrame(silenceLoop);
        return;
    }

    if (micAnalyser) {
        const data = new Uint8Array(micAnalyser.frequencyBinCount);
        micAnalyser.getByteFrequencyData(data);
        let sum = 0;
        for(let i=0; i<data.length; i++) sum += data[i];
        let average = sum / data.length;

        // TUNED THRESHOLDS:
        // Increased from 15 to 25 to ignore PC fans/breathing
        if (average > 25) {
            speakingFrameCount++; 
            silenceFrameCount = 0; 
        } else if (speakingFrameCount > 5) { 
            silenceFrameCount++;
        }
        
        // CUTOFF:
        // Reduced from 90 to 45 (0.7 seconds silence)
        if (silenceFrameCount > 45) { 
            console.log("🤖 Silence Auto-Stop");
            stopRecording(); 
        }
    }
    requestAnimationFrame(silenceLoop);
}

// --- PLAYBACK QUEUE ---
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
    if (!isPlayingSequence && audioQueue.length === 0) {
        if (window.conversationMode) startRecording();
        else setButtonState('IDLE');
    }
});

socket.on('error', (data) => {
    console.error("Server Error:", data);
    window.isServerGenerating = false; 
    setButtonState('IDLE');
    if (window.conversationMode) setTimeout(() => startRecording(), 2000);
});

function playNextInQueue() {
    ensureAudioContext();
    if (audioQueue.length === 0) {
        isPlayingSequence = false;
        window.isSpeaking = false; 
        if (window.isServerGenerating) setButtonState('THINKING');
        else if (window.conversationMode) setTimeout(() => startRecording(), 200);
        else setButtonState('IDLE');
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
            setTimeout(() => { playNextInQueue(); }, 150); 
        };
    } else {
        setTimeout(() => { playNextInQueue(); }, 1500);
    }
}

window.startRecording = startRecording;
window.stopRecording = stopRecording;
window.initMicrophone = initMicrophone;
window.setButtonState = setButtonState;
window.addEventListener('load', initMicrophone);