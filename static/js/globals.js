// GLOBAL CONFIGURATION & STATE
const MODEL_PATH = '/static/live2d/model/demongirl.model3.json'; 
const socket = io();

// Shared State
let app, model; 
let audioContext, analyser, dataArray;
let isSpeaking = false; 
let isRecording = false;

// --- AUDIO CONTEXT UNLOCKER ---
// This function is needed by Model, Audio, and UI files.
function ensureAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log("🔊 Audio Engine Woken Up!");
        });
    }
}

// Global unlock trigger
document.body.addEventListener('click', ensureAudioContext, { once: true });