// FILE: static/js/live2d-motions.js

/* ==========================================================================
   LIVE2D MOTION ENGINE
   - Fixed: Removed "Flinch" mechanic (stopped body jerking to voice volume).
   - Fixed: Body completely isolates/freezes when speaking.
   - Fixed: Time base is seconds (t) to prevent high-speed twitching.
   ========================================================================== */

// --- CONFIGURATION ---
const CONFIG = {
    // Timers (ms)
    BLINK_MIN: 2000,
    BLINK_MAX: 4000,
    LOOK_DELAY_ACTIVE: 1500,
    LOOK_DELAY_DROWSY: 4000,
    
    // Physics & Randomness
    SACCADE_INTERVAL: 800,
    MICRO_TILT_INTERVAL: 2000,
    MICRO_EXP_INTERVAL: 3000, 
    
    // Mouse Tracking
    MOUSE_TRACKING_SPEED: 0.1, 
    MOUSE_HEAD_RANGE: 30.0,     
    
    // Idle Thresholds (ms)
    STAGE_1_RELAXED: 15000,  
    STAGE_2_BORED: 90000,    
    STAGE_3_DROWSY: 180000,  
    STAGE_4_SLEEP: 250000    
};

// --- STATE VARIABLES ---
let eyeTarget = { x: 0, y: 0 };
let currentEye = { x: 0, y: 0 }; 
let headTarget = { x: 0, y: 0, z: 0 };
let currentHead = { x: 0, y: 0, z: 0 };

// 🆕 MOOD & SPEECH SMOOTHING
let moodPhysics = { headY: 0, bodyX: 0, headZ: 0 }; 
let speakingWeight = 0; // 0 = Silent, 1 = Full Speaking (Locks body)

// Mouse Input
let mousePos = { x: 0, y: 0 }; 
let isMouseActive = false;
let lastMouseMoveTime = 0;

// Brows & Expressions
let currentBrow = { l: 0, r: 0, angle: 0, form: 0 };
let currentSquint = 0;
let randomBrowOffset = { l: 0, r: 0, angle: 0 };
let randomSquintOffset = 0;
let randomMouthOffset = 0; 
let lastMicroExpTime = 0;

// Physics Noise
let bodyBiasX = 0;           
let currentBodyBiasX = 0;    
let saccadeOffset = { x: 0, y: 0 }; 
let microTilt = 0;
let breathOffset = 0; 

// Timers
let lastLookTime = 0;
let nextLookDelay = 1500; 
let lastPostureTime = 0;
let lastSaccadeTime = 0;
let lastMicroTiltTime = 0;
let lastInteractionTime = Date.now();

// Blink State
let blinkState = 0; 
let nextBlinkTime = 0;
let blinkValue = 1.0; 
let longBlinkDuration = 0;

// Idle State
let idleState = 0; 

// Mouth
let currentMouth = 0;
let currentMouthForm = 0;


/* ==========================================================================
   UTILITY FUNCTIONS
   ========================================================================== */

function resetIdleTimer() {
    lastInteractionTime = Date.now();
    if (idleState !== 0) {
        idleState = 0; 
    }
}

function getOrganicSway(time, speed, amplitude) {
    return (
        Math.sin(time * speed) + 
        Math.sin(time * speed * 0.5) * 0.5 + 
        Math.cos(time * speed * 0.25) * 0.5
    ) * amplitude;
}

function lerp(start, end, t) {
    return start * (1 - t) + end * t;
}

window.addEventListener('mousemove', (e) => {
    mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
    mousePos.y = -((e.clientY / window.innerHeight) * 2 - 1); 
    isMouseActive = true;
    lastMouseMoveTime = Date.now();
    if (Math.abs(e.movementX) > 5 || Math.abs(e.movementY) > 5) {
        resetIdleTimer();
    }
});


/* ==========================================================================
   MAIN ANIMATION LOOP
   ========================================================================== */
function animateLive2D(model, time, isSpeaking, currentMood) {
    if (!model || !model.internalModel) return;
    
    window.currentModel = model; 
    const core = model.internalModel.coreModel;
    let now = Date.now();
    
    // Time in Seconds (t) to prevent twitching
    let t = now / 1000; 

    try {
        // --- 1. IDLE STATE ---
        if (now - lastMouseMoveTime > 10000) isMouseActive = false;

        if (!isSpeaking) {
            let timeSinceAction = now - lastInteractionTime;
            if (timeSinceAction > CONFIG.STAGE_1_RELAXED && timeSinceAction < CONFIG.STAGE_2_BORED) {
                if (idleState !== 1) { setExpression(model, 'Reset', true); idleState = 1; }
            }
            else if (timeSinceAction > CONFIG.STAGE_2_BORED && timeSinceAction < CONFIG.STAGE_3_DROWSY) {
                if (idleState !== 2) { setExpression(model, 'Bored', true); idleState = 2; }
            }
            else if (timeSinceAction > CONFIG.STAGE_3_DROWSY && timeSinceAction < CONFIG.STAGE_4_SLEEP) {
                if (idleState !== 3) { setExpression(model, 'Sleepy', true); idleState = 3; }
            }
            else if (timeSinceAction > CONFIG.STAGE_4_SLEEP) {
                if (idleState !== 4) { setExpression(model, 'Sleepy', true); idleState = 4; }
            }
        } else {
            resetIdleTimer();
        }

        // --- 2. MICRO-EXPRESSIONS ---
        if (now - lastMicroExpTime > CONFIG.MICRO_EXP_INTERVAL + Math.random() * 4000) {
            if (idleState < 3) { 
                let rand = Math.random();
                if (rand < 0.25) {
                    randomBrowOffset = { l: 0, r: 0.2, angle: -0.1 }; randomSquintOffset = 0.1; randomMouthOffset = -0.2; 
                } else if (rand < 0.5) {
                    randomBrowOffset = { l: 0.2, r: 0.2, angle: 0.1 }; randomSquintOffset = -0.1; randomMouthOffset = 0.0;
                } else if (rand < 0.75) {
                    randomBrowOffset = { l: 0.1, r: 0.1, angle: 0.1 }; randomSquintOffset = 0.2; randomMouthOffset = 0.5; 
                } else {
                    randomBrowOffset = { l: 0, r: 0, angle: 0 }; randomSquintOffset = 0; randomMouthOffset = 0.0;
                }
            } else {
                 randomBrowOffset = { l: 0, r: 0, angle: 0 }; randomSquintOffset = 0; randomMouthOffset = 0;
            }
            lastMicroExpTime = now;
        }

        // Targets
        let targetBrowL = 0, targetBrowR = 0, targetBrowAngle = 0, targetSquint = 0;
        if (currentMood === 'Thinking') { targetBrowL = -0.3; targetBrowR = 0.4; targetBrowAngle = -0.2; targetSquint = 0.4; }
        else if (currentMood === 'Listening') { targetBrowL = 0.3; targetBrowR = 0.3; targetSquint = 0.15; }
        else if (currentMood === 'Skeptical') { targetBrowL = -0.4; targetBrowR = 0.5; targetSquint = 0.6; }
        else if (currentMood === 'Excited' || currentMood === 'Happy') { targetBrowL = 0.4; targetBrowR = 0.4; targetBrowAngle = 0.3; }
        else if (currentMood === 'Angry') { targetBrowL = -0.6; targetBrowR = -0.6; targetBrowAngle = -0.8; targetSquint = 0.3; }

        let microSpeed = 0.05; 
        currentBrow.l = lerp(currentBrow.l, targetBrowL + randomBrowOffset.l, microSpeed);
        currentBrow.r = lerp(currentBrow.r, targetBrowR + randomBrowOffset.r, microSpeed);
        currentBrow.angle = lerp(currentBrow.angle, targetBrowAngle + randomBrowOffset.angle, microSpeed);
        currentSquint = lerp(currentSquint, targetSquint + randomSquintOffset, microSpeed);

        core.setParameterValueById('ParamBrowLY', currentBrow.l);
        core.setParameterValueById('ParamBrowRY', currentBrow.r);
        core.setParameterValueById('ParamBrowLAngle', currentBrow.angle);
        core.setParameterValueById('ParamBrowRAngle', currentBrow.angle);


        // --- 3. EYES ---
        let blinkSpeed = (idleState === 3) ? 0.08 : 0.15;
        if (currentSquint < 0) currentSquint = 0; if (currentSquint > 0.8) currentSquint = 0.8;
        let awakeBase = 1.0 - currentSquint; 
        let drowsyBase = 0.7 - (currentSquint * 0.5);
        let baseEyeOpen = (idleState === 3) ? drowsyBase : awakeBase;
        if (idleState === 4) baseEyeOpen = 0.0;

        if (idleState !== 4) { 
            if (now > nextBlinkTime) { blinkState = 1; nextBlinkTime = now + (CONFIG.BLINK_MIN + Math.random() * CONFIG.BLINK_MAX); }
            if (blinkState === 1) { 
                blinkValue -= blinkSpeed;
                if (blinkValue <= 0) { blinkValue = 0; blinkState = 2; if (Math.random() < 0.15) { blinkState = 3; longBlinkDuration = now + 150 + Math.random() * 150; } }
            } else if (blinkState === 3) { 
                if (now > longBlinkDuration) blinkState = 2; 
            } else if (blinkState === 2) { 
                blinkValue += blinkSpeed;
                if (blinkValue >= baseEyeOpen) { blinkValue = baseEyeOpen; blinkState = 0; if (Math.random() < 0.2) nextBlinkTime = now + 100; }
            } else { blinkValue = lerp(blinkValue, baseEyeOpen, 0.2); }
        } else { blinkValue = 0.0; }

        let eyeL = blinkValue; let eyeR = blinkValue;
        if (currentMood === 'Skeptical') { eyeL = Math.min(blinkValue, 0.4); }

        core.setParameterValueById('ParamEyeLOpen', eyeL);
        core.setParameterValueById('ParamEyeROpen', eyeR);


        // --- 4. PHYSICS & MOTION (FIXED) ---
        
        // A. Random Noise
        if (now - lastMicroTiltTime > CONFIG.MICRO_TILT_INTERVAL + Math.random() * 1000) {
            microTilt = (Math.random() - 0.5) * 2.0; lastMicroTiltTime = now;
            breathOffset = (Math.random() - 0.5) * 0.2; 
        }
        if (now - lastSaccadeTime > CONFIG.SACCADE_INTERVAL + Math.random() * 500) {
            saccadeOffset.x = (Math.random() - 0.5) * 0.15; 
            saccadeOffset.y = (Math.random() - 0.5) * 0.1;
            lastSaccadeTime = now;
        }

        // B. Speaking Weight Calculation
        // This creates a smooth transition between "Moving" and "Still"
        // 0.0 = Not Speaking (Moving), 1.0 = Speaking (Still)
        let targetSpeechWeight = isSpeaking ? 1.0 : 0.0;
        speakingWeight = lerp(speakingWeight, targetSpeechWeight, 0.1);

        // C. Target Calculation
        if (isSpeaking) {
            eyeTarget.x = 0; eyeTarget.y = 0;
            // HEAD NOD ONLY. No side-to-side.
            headTarget.x = 0; 
            headTarget.y = Math.sin(t * 5) * 1.5; // Moderate nod
            headTarget.z = 0;     
        } else {
            if (currentMood === 'Listening') {
                eyeTarget.x = 0; eyeTarget.y = 0; headTarget.x = 0; headTarget.y = -5; headTarget.z = 0; 
            }
            else if (isMouseActive && idleState < 2) { 
                eyeTarget.x = mousePos.x * 0.8; eyeTarget.y = mousePos.y * 0.8;
                headTarget.x = mousePos.x * CONFIG.MOUSE_HEAD_RANGE; 
                headTarget.y = mousePos.y * CONFIG.MOUSE_HEAD_RANGE;
                headTarget.z = mousePos.x * 5.0; 
            }
            else if (now - lastLookTime > nextLookDelay) {
                if (idleState < 3) {
                     if (Math.random() > 0.4) {
                        eyeTarget.x = (Math.random() - 0.5) * 2.0; eyeTarget.y = (Math.random() - 0.5) * 1.5;
                        headTarget.x = eyeTarget.x * 12; headTarget.y = eyeTarget.y * 8; headTarget.z = (Math.random() - 0.5) * 5;
                    } else {
                        eyeTarget.x = 0; eyeTarget.y = 0; headTarget.x = 0; headTarget.y = 0; headTarget.z = 0;
                    }
                }
                lastLookTime = now;
                nextLookDelay = (idleState >= 3) ? 4000 : (CONFIG.LOOK_DELAY_ACTIVE + Math.random() * 2500); 
            }
            
            if (idleState < 3 && !isMouseActive) {
                headTarget.x += getOrganicSway(t, 0.4, 1.5);
                headTarget.y += getOrganicSway(t, 0.3, 1.0);
            }
        }

        // D. Interpolation
        let smoothing = (isMouseActive) ? CONFIG.MOUSE_TRACKING_SPEED : ((idleState >= 3) ? 0.05 : 0.2);
        currentEye.x += (eyeTarget.x + saccadeOffset.x - currentEye.x) * smoothing;
        currentEye.y += (eyeTarget.y + saccadeOffset.y - currentEye.y) * smoothing;
        
        let headSmoothing = smoothing * 0.25; 
        currentHead.x += (headTarget.x - currentHead.x) * headSmoothing;
        currentHead.y += (headTarget.y - currentHead.y) * headSmoothing;
        currentHead.z += ((headTarget.z + microTilt) - currentHead.z) * headSmoothing;

        // E. Body Physics (The Fix)
        // 1. Calculate natural movement (Sway)
        let bodySwayX = (idleState === 4) ? 0 : getOrganicSway(t, 0.5, 1.0); 
        let bodySwayZ = (idleState === 4) ? 0 : getOrganicSway(t, 0.4, 0.5); 

        if (now - lastPostureTime > 15000 + Math.random() * 5000) {
            bodyBiasX = (Math.random() - 0.5) * 6; lastPostureTime = now;
        }
        currentBodyBiasX += (bodyBiasX - currentBodyBiasX) * 0.01;

        let naturalBodyX = (currentHead.x * 0.3) + bodySwayX + currentBodyBiasX;
        let naturalBodyY = (currentHead.y * 0.1); // Small bounce from head
        let naturalBodyZ = (currentHead.x * 0.1) + bodySwayZ;

        // 2. APPLY THE FREEZE
        // If speakingWeight is 1.0, we force all Body Params to 0 (or a very neutral state).
        // This ensures the body does not move with the voice.
        let bodyX = lerp(naturalBodyX, 0, speakingWeight);
        let bodyY = lerp(naturalBodyY, 0, speakingWeight); // Also freeze Y bounce
        let bodyZ = lerp(naturalBodyZ, 0, speakingWeight);

        // F. Mood Physics
        let targetMoodHeadY = 0, targetMoodBodyX = 0, targetMoodHeadZ = 0, bodyY_Offset = 0; 
        if (currentMood === 'Laughing') { let b = Math.sin(t * 15) * 3.0; targetMoodHeadY = b; bodyY_Offset = b * 0.1; }
        else if (currentMood === 'Excited') { let j = (1 - Math.cos(t * 8)) * 0.5 * 10.0; targetMoodHeadY = j; bodyY_Offset = j * 0.3; }
        else if (currentMood === 'Shiver' || currentMood === 'Scared') { let s = Math.sin(t * 25) * 1.5; targetMoodBodyX = s; targetMoodHeadZ = s * 0.5; }

        moodPhysics.headY = lerp(moodPhysics.headY, targetMoodHeadY, 0.1);
        moodPhysics.bodyX = lerp(moodPhysics.bodyX, targetMoodBodyX, 0.1);
        moodPhysics.headZ = lerp(moodPhysics.headZ, targetMoodHeadZ, 0.1);

        // G. Apply
        core.setParameterValueById('ParamEyeBallX', currentEye.x);
        core.setParameterValueById('ParamEyeBallY', currentEye.y);
        core.setParameterValueById('ParamAngleX', currentHead.x);
        core.setParameterValueById('ParamAngleY', currentHead.y + moodPhysics.headY);
        core.setParameterValueById('ParamAngleZ', currentHead.z + moodPhysics.headZ);
        
        core.setParameterValueById('ParamBodyAngleX', bodyX + moodPhysics.bodyX);
        core.setParameterValueById('ParamBodyAngleY', bodyY + bodyY_Offset); 
        core.setParameterValueById('ParamBodyAngleZ', bodyZ); // No flinch modification here anymore

        let breathSpeed = (idleState === 4) ? 0.5 : (1.2 + breathOffset + Math.sin(t * 2) * 0.3);
        let breath = (Math.sin(t * breathSpeed) + 1) / 2; 
        core.setParameterValueById('ParamBreath', breath);

    } catch (e) { }
}


/* ==========================================================================
   LIP SYNC & AUDIO ANALYSIS
   ========================================================================== */
function animateMouthLive2D(model, analyser, dataArray, isSpeaking) {
    if (!model || !model.internalModel) return;

    let targetOpenness = 0;
    let targetForm = 0; 

    if (analyser) {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        let len = Math.min(dataArray.length, 40); 
        for(let i = 0; i < len; i++) sum += dataArray[i];
        let average = sum / len;
        
        // 🆕 REMOVED FLINCH LOGIC HERE
        // No more "reactionLean" calculation based on volume.

        if (isSpeaking) {
            let rawVolume = Math.max(0, average - 15) / 50; 
            targetOpenness = rawVolume * 1.2; 
            if (targetOpenness > 1.0) targetOpenness = 1.0;
            if (targetOpenness > 0.2) targetForm = 0.3; 
        }
    }

    if (!isSpeaking && targetOpenness < 0.2) { targetForm += randomMouthOffset; }

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
    
    if (!isInternal && expName !== 'Reset') { resetIdleTimer(); }
    if (manager.definitions && manager.definitions[expName]) {
        const def = manager.definitions[expName];
        def.Parameters = def.Parameters.filter(p => p.Id !== 'ParamMouthOpenY');
    }
    try { model.expression(expName); } catch(e) { }
}