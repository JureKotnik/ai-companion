// LIVE2D & PIXI LOGIC

function initPixi() {
    const canvasElement = document.getElementById('canvas');
    app = new PIXI.Application({
        view: canvasElement, 
        resizeTo: window, 
        transparent: true, 
        autoDensity: true, 
        antialias: true
    });

    PIXI.live2d.Live2DModel.from(MODEL_PATH, { autoInteract: false }).then((loadedModel) => {
        model = loadedModel;
        app.stage.addChild(model);
        
        // Positioning
        model.anchor.set(0.5, 0.5);
        model.x = window.innerWidth / 2;
        model.y = window.innerHeight / 2 + 100;
        const scale = (window.innerHeight * 0.4) / model.height;
        model.scale.set(scale);

        // Hide Loading Screen
        document.getElementById('loading').style.display = 'none';
        
        // Start Loop
        app.ticker.add(animate);
        console.log("✔ Model Loaded Successfully");

    }).catch(err => {
        console.error("FAILED TO LOAD MODEL:", err);
        document.getElementById('loading').innerText = "Load Failed: " + err;
    });
}

// --- EXPRESSION HANDLER ---
let currentMood = "Reset"; 

function triggerExp(name) {
    const dropdown = document.getElementById('emotion-select');
    const actions = ["Wink", "Surprised", "Sneeze", "Shocked"];
    
    // 1. Temporary Actions (blink, sneeze)
    if (actions.includes(name)) {
        if (model) setExpression(model, name);
        if(dropdown) dropdown.value = name;
        
        // Revert after 600ms
        setTimeout(() => {
            if (model) setExpression(model, currentMood);
            if(dropdown) dropdown.value = currentMood;
        }, 600); 
        return;
    }

    // 2. Permanent Moods (Happy, Sad)
    currentMood = name; 
    if(dropdown && dropdown.value !== name) {
        // Only update dropdown if the option exists
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
    
    // Functions from 'movements.js'
    if (typeof animateLive2D === "function") animateLive2D(model, time, isSpeaking);
    if (typeof animateMouthLive2D === "function") animateMouthLive2D(model, analyser, dataArray, isSpeaking);
}

// Resize Handler
window.addEventListener('resize', () => {
    if (app) app.renderer.resize(window.innerWidth, window.innerHeight);
});