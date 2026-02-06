// FILE: static/js/model-manager.js

// --- CONFIGURATION ---
const SCALE_FACTOR = 0.40;    // 0.75 = Fits 75% of screen height
const ZOOM_STRENGTH = 1.9;    // Zoom level (Upper body)
const ZOOM_Y_OFFSET = 0.60;   // Y offset for zoom (0.5 = Center)

// --- GLOBAL VARIABLES ---
let isZoomed = false; 
let initialModelHeight = 0;   // STORE ORIGINAL HEIGHT HERE

// LIVE2D & PIXI LOGIC
function initPixi() {
    const canvasElement = document.getElementById('canvas');
    
    app = new PIXI.Application({
        view: canvasElement, 
        resizeTo: window, 
        backgroundAlpha: 0, 
        autoDensity: true, 
        antialias: true
    });

    PIXI.live2d.Live2DModel.from(MODEL_PATH, { autoInteract: false }).then((loadedModel) => {
        model = loadedModel;
        app.stage.addChild(model);
        
        // 1. CAPTURE ORIGINAL HEIGHT ONCE (Crucial Fix)
        initialModelHeight = model.height;

        // 2. Initial Positioning
        updateModelTransform(); 

        document.getElementById('loading').style.display = 'none';
        app.ticker.add(animate);
        console.log("✔ Model Loaded Successfully. Original Height:", initialModelHeight);

    }).catch(err => {
        console.error("FAILED TO LOAD MODEL:", err);
        document.getElementById('loading').innerText = "Load Failed: " + err;
    });
}

// --- ZOOM & CAMERA CONTROLS ---
function toggleZoom() {
    isZoomed = !isZoomed; 
    const btn = document.getElementById('zoom-btn');
    
    if (btn) {
        if (isZoomed) {
            btn.innerText = "🔍 ZOOM: UPPER";
            btn.style.background = "rgba(0, 210, 255, 0.2)";
            btn.style.borderColor = "rgba(0, 210, 255, 0.5)";
        } else {
            btn.innerText = "🔍 ZOOM: FULL";
            btn.style.background = "";
            btn.style.borderColor = "";
        }
    }
    updateModelTransform();
}

function updateModelTransform() {
    if (!model || initialModelHeight === 0) return;

    model.anchor.set(0.5, 0.5);
    model.x = window.innerWidth / 2;

    // FIX: Always calculate scale based on the ORIGINAL height, not current height
    const baseScale = (window.innerHeight * SCALE_FACTOR) / initialModelHeight;

    if (isZoomed) {
        // --- ZOOM MODE (Upper Body) ---
        model.scale.set(baseScale * ZOOM_STRENGTH); 
        model.y = window.innerHeight / 2 + (window.innerHeight * ZOOM_Y_OFFSET); 
    } else {
        // --- FULL BODY MODE ---
        model.scale.set(baseScale);
        model.y = window.innerHeight / 2 + (window.innerHeight * 0.1); 
    }
}

// --- EXPRESSION HANDLER ---
let currentMood = "Reset"; 

function triggerExp(name) {
    const dropdown = document.getElementById('emotion-select');
    const actions = ["Wink", "Surprised", "Sneeze", "Shocked"];
    
    if (actions.includes(name)) {
        if (model) setExpression(model, name);
        if(dropdown) dropdown.value = name;
        setTimeout(() => {
            if (model) setExpression(model, currentMood);
            if(dropdown) dropdown.value = currentMood;
        }, 600); 
        return;
    }

    currentMood = name; 
    if(dropdown && dropdown.value !== name) {
        if ([...dropdown.options].some(o => o.value === name)) {
            dropdown.value = name;
        }
    }
    if (model) setExpression(model, name);
}

// --- ANIMATION LOOP ---
function animate() {
    if (!model) return;
    let time = Date.now() / 1000;
    if (typeof animateLive2D === "function") animateLive2D(model, time, isSpeaking);
    if (typeof animateMouthLive2D === "function") animateMouthLive2D(model, analyser, dataArray, isSpeaking);
}

window.addEventListener('resize', () => {
    if (app) app.renderer.resize(window.innerWidth, window.innerHeight);
    updateModelTransform(); 
});