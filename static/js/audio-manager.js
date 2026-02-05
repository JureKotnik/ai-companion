// MICROPHONE & PLAYBACK LOGIC

let mediaRecorder;
let audioChunks = [];
let micAnalyser, micDataArray, micVisualizerInterval;

// --- 1. MICROPHONE SETUP ---
function initMicrophone() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const btn = document.getElementById('mic-btn');
        if(btn) btn.innerText = "Mic Not Supported";
        return;
    }

    // Determine Supported MimeType
    let mimeType = 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
            
            // Visualizer Setup (To check if mic is hot)
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
            if(btn) btn.innerText = "Mic Error (Check Console)";
        });
}

function handleRecordingStop(mimeType) {
    const audioBlob = new Blob(audioChunks, { type: mimeType });
    
    // Only send if audio is substantial (> 1kb)
    if (audioBlob.size > 1000) { 
        console.log(`🎤 Sending Audio: ${audioBlob.size} bytes`);
        socket.emit('audio_stream', audioBlob);
    } else {
        console.warn("🎤 Audio too short. Ignored.");
    }
    
    audioChunks = []; 
    
    const btn = document.getElementById('mic-btn');
    if(btn) {
        btn.innerText = "Processing...";
        btn.classList.remove('listening');
        btn.style.boxShadow = "none";
        btn.style.borderColor = "";
    }
    
    clearInterval(micVisualizerInterval);
}

function startRecording() {
    ensureAudioContext();
    if (mediaRecorder && mediaRecorder.state === "inactive") {
        audioChunks = [];
        mediaRecorder.start(100); // 100ms chunks
        
        const btn = document.getElementById('mic-btn');
        btn.classList.add('listening');
        btn.innerText = "Listening...";
        
        // Start Visualizer Loop
        micVisualizerInterval = setInterval(() => {
            if(micAnalyser && btn) {
                micAnalyser.getByteFrequencyData(micDataArray);
                let sum = 0;
                for(let i=0; i<micDataArray.length; i++) sum += micDataArray[i];
                let avg = sum / micDataArray.length;
                
                // Green Glow Logic
                let glow = Math.min(255, avg * 2);
                btn.style.boxShadow = `0 0 ${avg}px rgb(${255-glow}, ${glow + 50}, 50)`;
                btn.style.borderColor = `rgb(${255-glow}, ${glow + 50}, 50)`;
            }
        }, 50);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
    }
}

// --- 2. PLAYBACK QUEUE ---
let audioQueue = [];
let isPlayingSequence = false;

// Listen for incoming audio
socket.on('speak_audio_sequence', (playlist) => {
    // Reset Mic Button
    const btn = document.getElementById('mic-btn');
    if (btn) {
        btn.innerText = "Hold SPACE to Speak";
        btn.classList.remove('listening');
        btn.style.boxShadow = "none";
        btn.style.background = "";
    }

    if (typeof resetIdleTimer === "function") resetIdleTimer();
    
    audioQueue = audioQueue.concat(playlist); 
    if (!isPlayingSequence) playNextInQueue();
});

function playNextInQueue() {
    ensureAudioContext();
    
    if (audioQueue.length === 0) {
        isPlayingSequence = false;
        return;
    }

    isPlayingSequence = true;
    const currentItem = audioQueue.shift(); 

    // Show Text
    if (currentItem.text) {
        const t = document.getElementById('response-text');
        if(t) {
            t.innerText = currentItem.text; 
            t.style.display = 'block';
        }
    }
    
    // Trigger Face
    if (currentItem.emotion) {
        triggerExp(currentItem.emotion);
    }

    // Play Audio
    if (currentItem.audio) {
        const audio = new Audio(currentItem.audio);
        audio.crossOrigin = 'anonymous';
        
        if(audioContext) {
            const source = audioContext.createMediaElementSource(audio);
            // Connect to Visuals (Lips) AND Speakers
            source.connect(analyser);
            source.connect(audioContext.destination);
        }
        
        audio.play().catch(e => console.error("Playback failed:", e));
        isSpeaking = true;
        
        audio.onended = () => {
            isSpeaking = false;
            // Ask server to delete file
            socket.emit('delete_audio', { filename: currentItem.audio });
            
            // Small pause before next sentence
            setTimeout(() => { playNextInQueue(); }, 200); 
        };
    } else {
        // Fallback for text-only
        setTimeout(() => { playNextInQueue(); }, 1000);
    }
}

// Initialize Mic on Load
window.addEventListener('load', initMicrophone);