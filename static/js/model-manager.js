// FILE: static/js/model-manager.js

// --- CONFIGURATION ---
const SCALE_FACTOR = 0.4;    
const ZOOM_STRENGTH = 1.9;    
const ZOOM_Y_OFFSET = 0.60;   

// --- GLOBAL VARIABLES ---
let isZoomed = false; 
let initialModelHeight = 0;   
let previousMood = "Reset"; 

// SMOOTHING VARIABLES
let thinkingWeight = 0; // 0.0 = Normal, 1.0 = Fully Thinking
let lastFrameTime = Date.now();

// HELPER: Linear Interpolation (Blends A to B by 't')
function lerp(start, end, t) {
    return start * (1 - t) + end * t;
}

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
        
        initialModelHeight = model.height;
        updateModelTransform(); 

        document.getElementById('loading').style.display = 'none';
        
        // Reset timing
        lastFrameTime = Date.now();
        
        app.ticker.add(animate);
        console.log("✔ Model Loaded Successfully");

    }).catch(err => {
        console.error("FAILED TO LOAD MODEL:", err);
        document.getElementById('loading').innerText = "Load Failed: " + err;
    });
}

// --- THINKING STATE HANDLER ---
window.setThinking = function(active) {
    if (active) {
        if (currentMood !== "Thinking") {
            previousMood = currentMood; 
            triggerExp("Thinking"); 
        }
    } else {
        if (currentMood === "Thinking") {
            triggerExp(previousMood); 
        }
    }
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

    const baseScale = (window.innerHeight * SCALE_FACTOR) / initialModelHeight;

    if (isZoomed) {
        model.scale.set(baseScale * ZOOM_STRENGTH); 
        model.y = window.innerHeight / 2 + (window.innerHeight * ZOOM_Y_OFFSET); 
    } else {
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

// --- ANIMATION LOOP (WITH SMOOTHING) ---
function animate() {
    if (!model) return;
    
    const now = Date.now();
    const dt = (now - lastFrameTime) / 1000; // Delta time in seconds
    lastFrameTime = now;
    
    // 1. Run Standard Movements
    if (typeof animateLive2D === "function") animateLive2D(model, now / 1000, isSpeaking, currentMood);
    if (typeof animateMouthLive2D === "function") animateMouthLive2D(model, analyser, dataArray, isSpeaking);

    // 2. CALCULATE SMOOTH WEIGHT
    // If thinking, slide weight up to 1.0. If not, slide down to 0.0.
    const targetWeight = (currentMood === "Thinking") ? 1.0 : 0.0;
    const blendSpeed = 3.0; // Higher = Faster transition (3.0 is snappy but smooth)

    if (thinkingWeight < targetWeight) {
        thinkingWeight += blendSpeed * dt;
        if (thinkingWeight > 1.0) thinkingWeight = 1.0;
    } else if (thinkingWeight > targetWeight) {
        thinkingWeight -= blendSpeed * dt;
        if (thinkingWeight < 0.0) thinkingWeight = 0.0;
    }

    // 3. APPLY SMOOTH BLEND
    // Only run this logic if we are even partially in "Thinking" mode
    if (thinkingWeight > 0.01) {
        try {
            const core = model.internalModel.coreModel;
            
            // Helper to blend a parameter safely
            const blendParam = (id, targetValue) => {
                const currentVal = core.getParameterValueById(id);
                // Math: NewValue = Current + (Target - Current) * Weight
                // NOTE: We blend from the *current* idle position towards the target
                // To force the look more strongly, we can just Lerp from Current to Target
                const newVal = lerp(currentVal, targetValue, thinkingWeight);
                core.setParameterValueById(id, newVal);
            };

            // A. Look Up and Right
            blendParam('ParamEyeBallX', 0.6); 
            blendParam('ParamEyeBallY', 0.5); 

            // B. Tilt Head
            blendParam('ParamAngleZ', 15); 
            
            // C. Lean Body
            blendParam('ParamBodyAngleZ', 5);

            // D. Pursed Lips
            blendParam('ParamMouthForm', -0.8);

        } catch (e) {
            // console.warn(e); 
        }
    }
}

window.addEventListener('resize', () => {
    if (app) app.renderer.resize(window.innerWidth, window.innerHeight);
    updateModelTransform(); 
});