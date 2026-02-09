// FILE: static/js/live2d-motions.js

/* ==========================================================================
   LIVE2D MOTION ENGINE
   Handles: Idle Behavior, Physics, Expressions, and Lip Sync
   ========================================================================== */

// --- CONFIGURATION & STATE ---
const CONFIG = {
    // Timers (ms)
    BLINK_MIN: 2000,
    BLINK_MAX: 4000,
    LOOK_DELAY_ACTIVE: 1500,
    LOOK_DELAY_DROWSY: 4000,
    
    // Idle Thresholds (ms)
    STAGE_1_RELAXED: 15000,  // 15s
    STAGE_2_BORED: 90000,    // 1.5 min
    STAGE_3_DROWSY: 180000,  // 3 min
    STAGE_4_SLEEP: 250000    // 4+ min
};

// Internal State
let eyeTarget = { x: 0, y: 0 };
let currentEye = { x: 0, y: 0 }; 
let headTarget = { x: 0, y: 0, z: 0 };
let currentHead = { x: 0, y: 0, z: 0 };

// Physics State
let bodyBiasX = 0;           // Posture shift
let currentBodyBiasX = 0;    
let saccadeOffset = { x: 0, y: 0 }; // Eye Jitter

// Timers
let lastLookTime = 0;
let nextLookDelay = 1500; 
let lastPostureTime = 0;
let lastSaccadeTime = 0;
let lastInteractionTime = Date.now();
let lastFlavorTime = 0; 

// Blink State
let blinkState = 0; // 0: Open, 1: Closing, 2: Opening
let nextBlinkTime = 0;
let blinkValue = 1.0; 

// Idle State (0=Active, 1=Relaxed, 2=Bored, 3=Drowsy, 4=Sleep)
let idleState = 0; 

// Mouth
let currentMouth = 0;
let currentMouthForm = 0;


/* ==========================================================================
   UTILITY FUNCTIONS
   ========================================================================== */

// Reset Idle Timer (Call this when user interacts)
function resetIdleTimer() {
    lastInteractionTime = Date.now();
    if (idleState !== 0) {
        console.log("Wake up! Engaging...");
        idleState = 0; 
    }
}

// Organic Sway Math (Non-repeating sine waves)
function getOrganicSway(time, speed, amplitude) {
    return (
        Math.sin(time * speed) + 
        Math.sin(time * speed * 0.5) * 0.5 + 
        Math.cos(time * speed * 0.25) * 0.5
    ) * amplitude;
}


/* ==========================================================================
   MAIN ANIMATION LOOP
   Called every frame by model-manager.js
   ========================================================================== */
function animateLive2D(model, time, isSpeaking, currentMood) {
    if (!model || !model.internalModel) return;
    
    window.currentModel = model; 
    const core = model.internalModel.coreModel;
    let now = Date.now();

    try {
        // ------------------------------------------------------------------
        // 1. IDLE STATE MACHINE (Behavior)
        // ------------------------------------------------------------------
        if (!isSpeaking) {
            let timeSinceAction = now - lastInteractionTime;

            // STAGE 1: RELAXED
            if (timeSinceAction > CONFIG.STAGE_1_RELAXED && timeSinceAction < CONFIG.STAGE_2_BORED) {
                if (idleState !== 1) { setExpression(model, 'Reset', true); idleState = 1; }
                
                // Random Smiles/Curiosity
                if (now - lastFlavorTime > 18000 && Math.random() < 0.25) { 
                    let exp = (Math.random() > 0.5) ? 'Smiling' : 'Love'; 
                    setExpression(model, exp, true);
                    setTimeout(() => setExpression(model, 'Reset', true), 3000);
                    lastFlavorTime = now;
                }
            }
            // STAGE 2: BORED
            else if (timeSinceAction > CONFIG.STAGE_2_BORED && timeSinceAction < CONFIG.STAGE_3_DROWSY) {
                if (idleState !== 2) { setExpression(model, 'Bored', true); idleState = 2; }
                
                // Random Looking Around
                if (now - lastFlavorTime > 12000 && Math.random() < 0.3) { 
                    let randomExp = (Math.random() > 0.5) ? 'Confused' : 'Thinking';
                    setExpression(model, randomExp, true);
                    setTimeout(() => setExpression(model, 'Bored', true), 2000);
                    lastFlavorTime = now;
                }
            }
            // STAGE 3: DROWSY
            else if (timeSinceAction > CONFIG.STAGE_3_DROWSY && timeSinceAction < CONFIG.STAGE_4_SLEEP) {
                if (idleState !== 3) { setExpression(model, 'Sleepy', true); idleState = 3; }
                
                // Nodding Off
                if (now - lastFlavorTime > 15000 && Math.random() < 0.4) {
                    setExpression(model, 'Sad', true);
                    setTimeout(() => setExpression(model, 'Sleepy', true), 3000);
                    lastFlavorTime = now;
                }
            }
            // STAGE 4: DEEP SLEEP
            else if (timeSinceAction > CONFIG.STAGE_4_SLEEP) {
                if (idleState !== 4) { setExpression(model, 'Sleepy', true); idleState = 4; }
            }
        } else {
            resetIdleTimer();
        }

        // ------------------------------------------------------------------
        // 2. EYE LOGIC (Blinking, Saccades, Squinting)
        // ------------------------------------------------------------------
        let blinkSpeed = (idleState === 3) ? 0.08 : 0.15;
        let baseEyeOpen = (idleState === 3) ? 0.7 : 1.0;
        if (idleState === 4) baseEyeOpen = 0.0;

        // Auto-Blink Logic
        if (idleState !== 4) { 
            if (now > nextBlinkTime) {
                blinkState = 1; // Start closing
                nextBlinkTime = now + (CONFIG.BLINK_MIN + Math.random() * (CONFIG.BLINK_MAX - CONFIG.BLINK_MIN));
            }
            if (blinkState === 1) { 
                blinkValue -= blinkSpeed;
                if (blinkValue <= 0) { blinkValue = 0; blinkState = 2; }
            } else if (blinkState === 2) { 
                blinkValue += blinkSpeed;
                if (blinkValue >= baseEyeOpen) { 
                    blinkValue = baseEyeOpen; 
                    blinkState = 0; 
                    // Double Blink Chance (20%)
                    if (Math.random() < 0.2) nextBlinkTime = now + 100; 
                }
            }
        } else {
            blinkValue = 0.0; 
        }

        // Micro-Saccades (Eye Jitter)
        if (now - lastSaccadeTime > 200 + Math.random() * 500) {
            saccadeOffset.x = (Math.random() - 0.5) * 0.1; 
            saccadeOffset.y = (Math.random() - 0.5) * 0.05;
            lastSaccadeTime = now;
        }

        // Mood Overrides (Skeptical Squint)
        let eyeL = blinkValue;
        let eyeR = blinkValue;
        if (currentMood === 'Skeptical') { 
            eyeL = Math.min(blinkValue, 0.4); 
            eyeR = Math.min(blinkValue, 1.0); 
        }

        // Apply Eyes
        let maxOpen = (idleState === 3) ? 0.7 : 1.0;
        if (idleState === 4) maxOpen = 0.0;
        
        // Add Saccades only if awake
        let jitterX = (idleState < 2) ? saccadeOffset.x : 0;
        let jitterY = (idleState < 2) ? saccadeOffset.y : 0;

        core.setParameterValueById('ParamEyeLOpen', Math.min(eyeL, maxOpen));
        core.setParameterValueById('ParamEyeROpen', Math.min(eyeR, maxOpen));

        // ------------------------------------------------------------------
        // 3. MOTION PHYSICS (Head, Body, Posture)
        // ------------------------------------------------------------------
        
        // A. Posture Shift (Every 15-20s)
        if (now - lastPostureTime > 15000 + Math.random() * 5000) {
            bodyBiasX = (Math.random() - 0.5) * 6; // Shift weight -3 to +3
            lastPostureTime = now;
        }
        currentBodyBiasX += (bodyBiasX - currentBodyBiasX) * 0.01; // Smooth transition

        // B. Target Calculation
        if (isSpeaking) {
            eyeTarget.x = 0; eyeTarget.y = 0;
            headTarget.x = getOrganicSway(time, 2.5, 3); 
            headTarget.y = getOrganicSway(time, 2.0, 2); 
            headTarget.z = Math.sin(time * 3) * 1.5;     
        } else {
            // Listening Mode
            if (currentMood === 'Listening') {
                eyeTarget.x = 0; eyeTarget.y = 0;
                headTarget.x = 0; headTarget.y = 0; headTarget.z = 15; 
            }
            // Standard Looking
            else if (now - lastLookTime > nextLookDelay) {
                if (idleState === 4) { // Sleep
                    eyeTarget.x = 0; eyeTarget.y = -0.8;
                    headTarget.x = 0; headTarget.y = -15; headTarget.z = 5;   
                } else if (idleState === 3) { // Drowsy
                    eyeTarget.x = (Math.random() - 0.5) * 0.5; eyeTarget.y = -0.5; 
                    headTarget.x = (Math.random() - 0.5) * 5; headTarget.y = -8; headTarget.z = 2; 
                } else { // Active
                    if (Math.random() > 0.4) {
                        eyeTarget.x = (Math.random() - 0.5) * 2.0; 
                        eyeTarget.y = (Math.random() - 0.5) * 1.5;
                        headTarget.x = eyeTarget.x * 12; 
                        headTarget.y = eyeTarget.y * 8;
                        headTarget.z = (Math.random() - 0.5) * 5;
                    } else {
                        eyeTarget.x = 0; eyeTarget.y = 0;
                        headTarget.x = 0; headTarget.y = 0; headTarget.z = 0;
                    }
                }
                lastLookTime = now;
                nextLookDelay = (idleState >= 3) ? 4000 : (CONFIG.LOOK_DELAY_ACTIVE + Math.random() * 2500); 
            }
            
            // Organic Sway Layers
            if (idleState < 3) {
                headTarget.x += getOrganicSway(time, 0.4, 1.5);
                headTarget.y += getOrganicSway(time, 0.3, 1.0);
            }
        }

        // C. Interpolation (Smoothing)
        let smoothing = (idleState >= 3) ? 0.05 : 0.2;
        
        currentEye.x += (eyeTarget.x + jitterX - currentEye.x) * smoothing;
        currentEye.y += (eyeTarget.y + jitterY - currentEye.y) * smoothing;
        
        let headSmoothing = smoothing * 0.25; 
        currentHead.x += (headTarget.x - currentHead.x) * headSmoothing;
        currentHead.y += (headTarget.y - currentHead.y) * headSmoothing;
        currentHead.z += (headTarget.z - currentHead.z) * headSmoothing;

        // Apply Base Parameters
        core.setParameterValueById('ParamEyeBallX', currentEye.x);
        core.setParameterValueById('ParamEyeBallY', currentEye.y);
        core.setParameterValueById('ParamAngleX', currentHead.x);
        core.setParameterValueById('ParamAngleY', currentHead.y);
        core.setParameterValueById('ParamAngleZ', currentHead.z);

        // D. Body Physics
        let bodySwayX = (idleState === 4) ? 0 : getOrganicSway(time, 0.2, 1.5); 
        let bodySwayZ = (idleState === 4) ? 0 : getOrganicSway(time, 0.15, 1.0); 

        // Apply Posture Bias
        let bodyX = (currentHead.x * 0.3) + bodySwayX + currentBodyBiasX;
        let bodyY = (currentHead.y * 0.1);
        let bodyZ = (currentHead.x * 0.1) + bodySwayZ;

        // E. SPECIAL MOOD PHYSICS (Overrides)
        let bodyY_Offset = 0;

        if (currentMood === 'Laughing') {
            let laughBounce = Math.sin(time * 25) * 3.0; 
            core.setParameterValueById('ParamAngleY', currentHead.y + laughBounce);
            bodyY_Offset += (laughBounce * 0.1); 
        }
        else if (currentMood === 'Excited') {
            let jumpCycle = (1 - Math.cos(time * 10)) * 0.5; 
            let totalJump = jumpCycle * 10.0; 
            core.setParameterValueById('ParamAngleY', currentHead.y + totalJump);
            bodyY_Offset += (totalJump * 0.3); 
        }
        else if (currentMood === 'Shiver' || currentMood === 'Scared') {
            let shiver = Math.sin(time * 50) * 1.5;
            core.setParameterValueById('ParamBodyAngleX', bodyX + shiver);
            core.setParameterValueById('ParamAngleZ', currentHead.z + (shiver * 0.5));
        }
        else if (currentMood === 'Skeptical') {
            core.setParameterValueById('ParamAngleX', currentHead.x - 5); 
            core.setParameterValueById('ParamBodyAngleZ', bodyZ - 2); 
        }

        core.setParameterValueById('ParamBodyAngleY', bodyY + bodyY_Offset); 
        core.setParameterValueById('ParamBodyAngleZ', bodyZ);

        // Breathing
        let breathSpeed = (idleState === 4) ? 0.5 : (1.2 + Math.sin(time * 0.1) * 0.3);
        let breath = (Math.sin(time * breathSpeed) + 1) / 2; 
        core.setParameterValueById('ParamBreath', breath);

    } catch (e) { }
}

/* ==========================================================================
   LIP SYNC
   ========================================================================== */
function animateMouthLive2D(model, analyser, dataArray, isSpeaking) {
    if (!model || !model.internalModel) return;

    let targetOpenness = 0;
    let targetForm = 0; 

    if (isSpeaking && analyser) {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        let len = Math.min(dataArray.length, 40); 
        for(let i = 0; i < len; i++) sum += dataArray[i];
        let average = sum / len;
        
        let rawVolume = Math.max(0, average - 15) / 50; 
        targetOpenness = rawVolume * 1.2; 
        if (targetOpenness > 1.0) targetOpenness = 1.0;
        if (targetOpenness > 0.2) targetForm = 0.3; 
    }

    let speed = (targetOpenness > currentMouth) ? 0.6 : 0.2; 
    currentMouth += (targetOpenness - currentMouth) * speed;
    currentMouthForm += (targetForm - currentMouthForm) * 0.1;

    try {
        const core = model.internalModel.coreModel;
        core.setParameterValueById('ParamMouthOpenY', currentMouth);
        core.setParameterValueById('ParamMouthForm', currentMouthForm);
    } catch (e) {}
}

/* ==========================================================================
   EXPRESSION MANAGER
   ========================================================================== */
function setExpression(model, expName, isInternal = false) {
    if (!model) return;
    const manager = model.internalModel.motionManager.expressionManager;
    if (!manager) return;
    
    if (!isInternal && expName !== 'Reset') {
        resetIdleTimer(); 
    }
    // Don't let expressions override lip sync
    if (manager.definitions && manager.definitions[expName]) {
        const def = manager.definitions[expName];
        def.Parameters = def.Parameters.filter(p => p.Id !== 'ParamMouthOpenY');
    }
    try { model.expression(expName); } catch(e) { }
}