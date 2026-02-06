// FILE: static/live2d/movements/movements.js

// --- STATE VARIABLES ---
let eyeTarget = { x: 0, y: 0 };
let currentEye = { x: 0, y: 0 }; 

let headTarget = { x: 0, y: 0, z: 0 };
let currentHead = { x: 0, y: 0, z: 0 };

// --- TIMERS ---
let lastLookTime = 0;
let nextLookDelay = 1500; 
let blinkState = 0; 
let nextBlinkTime = 0;
let blinkValue = 1.0; 

// --- IDLE LOGIC ---
let lastInteractionTime = Date.now();
let idleState = 0; 
let lastFlavorTime = 0; // Tracks random idle "flavor" events

// --- MOUTH ---
let currentMouth = 0;
let currentMouthForm = 0;

// --- UTILS ---
function resetIdleTimer() {
    lastInteractionTime = Date.now();
    if (idleState !== 0) {
        console.log("Wake up! Engaging...");
        idleState = 0; // Reset to Active
        // Note: The main loop will handle switching expression back to default
    }
}

// Organic Sway (Non-repeating motion)
function getOrganicSway(time, speed, amplitude) {
    return (
        Math.sin(time * speed) + 
        Math.sin(time * speed * 0.5) * 0.5 + 
        Math.cos(time * speed * 0.25) * 0.5
    ) * amplitude;
}

// --- MAIN ANIMATION LOOP ---
function animateLive2D(model, time, isSpeaking) {
    if (!model || !model.internalModel) return;
    
    window.currentModel = model; 

    try {
        const core = model.internalModel.coreModel;
        let now = Date.now();

        // ============================================================
        // 1. ADVANCED IDLE STATE MACHINE (Winding Down)
        // ============================================================
        if (!isSpeaking) {
            let timeSinceAction = now - lastInteractionTime;

            // STAGE 1: RELAXED (15s - 45s)
            // Just chilling, maybe looking a bit thoughtful
            if (timeSinceAction > 15000 && timeSinceAction < 45000) {
                if (idleState !== 1) {
                    console.log("Idle Stage 1: Relaxing...");
                    setExpression(model, 'Reset', true);
                    idleState = 1; 
                }
            }

            // STAGE 2: RESTLESS / BORED (45s - 90s)
            // Starting to look around, wondering where you are
            else if (timeSinceAction > 45000 && timeSinceAction < 90000) {
                if (idleState !== 2) {
                    console.log("Idle Stage 2: Getting Bored...");
                    setExpression(model, 'Bored', true); // Permanent mood change
                    idleState = 2;
                }

                // RANDOM FLAVOR: Every ~10-15s, look Confused or Thinking
                if (now - lastFlavorTime > 12000) {
                    if (Math.random() < 0.3) { 
                        // 30% chance to trigger a "Where are they?" look
                        let randomExp = (Math.random() > 0.5) ? 'Confused' : 'Thinking';
                        console.log(`Idle Flavor: ${randomExp}???`);
                        setExpression(model, randomExp, true);
                        
                        // Revert to Bored after 2 seconds
                        setTimeout(() => setExpression(model, 'Bored', true), 2000);
                    }
                    lastFlavorTime = now;
                }
            }

            // STAGE 3: DROWSY (90s - 120s)
            // Fighting sleep, eyes getting heavy
            else if (timeSinceAction > 90000 && timeSinceAction < 120000) {
                if (idleState !== 3) {
                    console.log("Idle Stage 3: Getting Drowsy...");
                    setExpression(model, 'Sleepy', true);
                    idleState = 3;
                }
                
                // RANDOM FLAVOR: Nodding off / Disappointed
                if (now - lastFlavorTime > 15000) {
                    if (Math.random() < 0.4) {
                        setExpression(model, 'Sad', true); // Pouty/Tired look
                        setTimeout(() => setExpression(model, 'Sleepy', true), 3000);
                    }
                    lastFlavorTime = now;
                }
            }

            // STAGE 4: DEEP SLEEP (120s+)
            // Fully out. Head down.
            else if (timeSinceAction > 120000) {
                if (idleState !== 4) {
                    console.log("Idle Stage 4: Zzzzz...");
                    setExpression(model, 'Sleepy', true); // Ensure base is sleepy
                    idleState = 4;
                }
            }

        } else {
            resetIdleTimer();
        }

        // ============================================================
        // 2. BLINKING LOGIC (Adapts to Drowsiness)
        // ============================================================
        let blinkSpeed = 0.15;
        let blinkInterval = 2000 + Math.random() * 2000;
        let baseEyeOpen = 1.0; // Normal

        // Adjust blinking based on state
        if (idleState === 3) { // Drowsy
            blinkSpeed = 0.08; // Slower blinks
            blinkInterval = 3500;
            baseEyeOpen = 0.7; // Eyes half-lidded
        } else if (idleState === 4) { // Asleep
            baseEyeOpen = 0.0; // Forced shut
        }

        if (idleState !== 4) { // Only blink if not asleep
            if (now > nextBlinkTime) {
                blinkState = 1; // Start closing
                nextBlinkTime = now + blinkInterval;
            }
            if (blinkState === 1) { 
                blinkValue -= blinkSpeed;
                if (blinkValue <= 0) { blinkValue = 0; blinkState = 2; }
            } else if (blinkState === 2) { 
                blinkValue += blinkSpeed;
                if (blinkValue >= baseEyeOpen) { blinkValue = baseEyeOpen; blinkState = 0; }
            }
        } else {
            blinkValue = 0.0; // Keep shut in sleep
        }

        // Apply Eye Openness (Clamp to baseEyeOpen for drowsy look)
        let finalEyeVal = Math.min(blinkValue, baseEyeOpen);
        core.setParameterValueById('ParamEyeLOpen', finalEyeVal);
        core.setParameterValueById('ParamEyeROpen', finalEyeVal);


        // ============================================================
        // 3. HEAD & BODY MOVEMENT (Damps down over time)
        // ============================================================
        if (isSpeaking) {
            // --- ACTIVE SPEAKING ---
            eyeTarget.x = 0; eyeTarget.y = 0;
            headTarget.x = getOrganicSway(time, 2.5, 3); 
            headTarget.y = getOrganicSway(time, 2.0, 2); 
            headTarget.z = Math.sin(time * 3) * 1.5;     
        } else {
            // --- IDLE LOOKING ---
            if (now - lastLookTime > nextLookDelay) {
                
                if (idleState === 4) { // SLEEPING
                    // Head slumps down and stays there
                    eyeTarget.x = 0; eyeTarget.y = -0.8;
                    headTarget.x = 0; headTarget.y = -15; headTarget.z = 5;   
                
                } else if (idleState === 3) { // DROWSY
                    // Slow, heavy movements, mostly looking down
                    eyeTarget.x = (Math.random() - 0.5) * 0.5; 
                    eyeTarget.y = -0.5; 
                    headTarget.x = (Math.random() - 0.5) * 5; 
                    headTarget.y = -8; 
                    headTarget.z = 2; 

                } else if (idleState === 2) { // RESTLESS
                    // Looking around more (searching)
                    eyeTarget.x = (Math.random() - 0.5) * 2.5; 
                    eyeTarget.y = (Math.random() - 0.5) * 1.0; 
                    headTarget.x = eyeTarget.x * 12; 
                    headTarget.y = eyeTarget.y * 5; 
                    headTarget.z = -5; // Slight tilt

                } else { // ACTIVE / RELAXED
                    // Normal behavior
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
                // Slower reactions as she gets more tired
                nextLookDelay = (idleState >= 3) ? 4000 : (1500 + Math.random() * 2500); 
            }
            
            // --- ORGANIC MOVEMENT LAYERS ---
            if (idleState < 3) {
                // Breathing sway (stops when deep sleeping to be steady)
                headTarget.x += getOrganicSway(time, 0.4, 1.5);
                headTarget.y += getOrganicSway(time, 0.3, 1.0);
                
                // Jitter (stops when drowsy)
                if (idleState < 2) {
                    headTarget.x += (Math.random() - 0.5) * 0.3;
                    headTarget.y += (Math.random() - 0.5) * 0.3;
                }
            }
        }

        // --- INTERPOLATION (Smoothing) ---
        // As state increases (0->4), movement speed decreases drastically
        let smoothing = 0.2; // Normal
        if (idleState === 2) smoothing = 0.1; // Bored (lazier)
        if (idleState === 3) smoothing = 0.05; // Drowsy (very slow)
        if (idleState === 4) smoothing = 0.02; // Sleep (barely moving)

        currentEye.x += (eyeTarget.x - currentEye.x) * smoothing;
        currentEye.y += (eyeTarget.y - currentEye.y) * smoothing;
        
        // Head moves slower than eyes
        let headSmoothing = smoothing * 0.25; 
        currentHead.x += (headTarget.x - currentHead.x) * headSmoothing;
        currentHead.y += (headTarget.y - currentHead.y) * headSmoothing;
        currentHead.z += (headTarget.z - currentHead.z) * headSmoothing;

        // --- APPLY PARAMETERS ---
        core.setParameterValueById('ParamEyeBallX', currentEye.x);
        core.setParameterValueById('ParamEyeBallY', currentEye.y);

        core.setParameterValueById('ParamAngleX', currentHead.x);
        core.setParameterValueById('ParamAngleY', currentHead.y);
        core.setParameterValueById('ParamAngleZ', currentHead.z);

        // Body Physics (Independent Sway)
        // Body sway stops in deep sleep
        let bodySwayX = (idleState === 4) ? 0 : getOrganicSway(time, 0.2, 1.5); 
        let bodySwayZ = (idleState === 4) ? 0 : getOrganicSway(time, 0.15, 1.0); 

        let bodyX = (currentHead.x * 0.3) + bodySwayX;
        let bodyY = (currentHead.y * 0.1);
        let bodyZ = (currentHead.x * 0.1) + bodySwayZ;

        core.setParameterValueById('ParamBodyAngleX', bodyX);
        core.setParameterValueById('ParamBodyAngleY', bodyY); 
        core.setParameterValueById('ParamBodyAngleZ', bodyZ);

        // Breathing (Deep and slow in sleep)
        let breathSpeed = (idleState === 4) ? 0.5 : (1.2 + Math.sin(time * 0.1) * 0.3);
        let breath = (Math.sin(time * breathSpeed) + 1) / 2; 
        core.setParameterValueById('ParamBreath', breath);

    } catch (e) { }
}

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

        if (targetOpenness < 0.1) targetOpenness = 0;
        if (targetOpenness > 1.0) targetOpenness = 1.0;
        if (targetOpenness > 0.2) targetForm = 0.3; 
    } else {
        targetOpenness = 0;
        targetForm = 0;
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

// Updated setExpression: Added isInternal flag
// isInternal = true means the idle timer WON'T reset (good for background changes)
function setExpression(model, expName, isInternal = false) {
    if (!model) return;
    const manager = model.internalModel.motionManager.expressionManager;
    if (!manager) return;
    
    // Only reset timer if this was a USER action or explicit reset
    if (!isInternal && expName !== 'Reset') {
        resetIdleTimer(); 
    }

    if (manager.definitions && manager.definitions[expName]) {
        const def = manager.definitions[expName];
        def.Parameters = def.Parameters.filter(p => p.Id !== 'ParamMouthOpenY');
    }
    try { model.expression(expName); } catch(e) { }
}