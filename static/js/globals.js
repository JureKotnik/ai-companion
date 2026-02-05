// GLOBAL CONFIGURATION & STATE

// 1. Constants
const MODEL_PATH = '/static/live2d/model/demongirl.model3.json'; 
const socket = io();

// 2. Core Objects (Shared)
let app, model; 
let audioContext, analyser, dataArray;

// 3. Logic Flags (DEFINED HERE ONLY)
// Other files will read/write these, but NOT re-declare them.
var conversationMode = false; 
var isRecording = false; 
var isSpeaking = false; 
var isServerGenerating = false; // The "Thinking" Lock

// --- HELPER: WAKE UP AUDIO ENGINE ---
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

// Unlock audio on first click
document.body.addEventListener('click', ensureAudioContext, { once: true });