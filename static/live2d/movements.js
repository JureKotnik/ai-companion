// --- LIVE2D MOVEMENT LIBRARY ---

// STATE VARIABLES
let eyeTarget = { x: 0, y: 0 };
let currentEye = { x: 0, y: 0 }; 

// Mouth State
let currentMouth = 0;
let speechTime = 0;

// Head State (Target positions)
let headTarget = { x: 0, y: 0, z: 0 };
let currentHead = { x: 0, y: 0, z: 0 };

// Timer Variables
let lastLookTime = 0;
let nextLookDelay = 2000;
let blinkState = 0; 
let nextBlinkTime = 0;
let blinkValue = 1.0; 

/**
 * MAIN ANIMATION LOOP
 */
function animateLive2D(model, time, isSpeaking) {
    if (!model || !model.internalModel) return;

    try {
        const core = model.internalModel.coreModel;
        let now = Date.now();

        // --- 1. BLINKING (Standard) ---
        if (now > nextBlinkTime) {
            blinkState = 1; 
            nextBlinkTime = now + 2000 + Math.random() * 4000;
        }
        if (blinkState === 1) { 
            blinkValue -= 0.15;
            if (blinkValue <= 0) { blinkValue = 0; blinkState = 2; }
        } else if (blinkState === 2) { 
            blinkValue += 0.15;
            if (blinkValue >= 1) { blinkValue = 1; blinkState = 0; }
        }
        core.setParameterValueById('ParamEyeLOpen', blinkValue);
        core.setParameterValueById('ParamEyeROpen', blinkValue);


        // --- 2. DETERMINE TARGETS (Where should she look?) ---
        if (isSpeaking) {
            // IF SPEAKING: Look at User (Center), slight motion
            eyeTarget.x = 0; 
            eyeTarget.y = 0;
            
            // Subtle head bob while talking
            headTarget.x = Math.sin(time * 2) * 2; 
            headTarget.y = Math.sin(time * 1.5) * 2;
            headTarget.z = Math.sin(time) * 1;
        } else {
            // IF IDLE: Look around randomly
            if (now - lastLookTime > nextLookDelay) {
                // Pick new random spot
                eyeTarget.x = (Math.random() - 0.5) * 2.0; 
                eyeTarget.y = (Math.random() - 0.5) * 1.0;
                
                // Head follows eyes (Multiplied for range)
                headTarget.x = eyeTarget.x * 15; 
                headTarget.y = eyeTarget.y * 10;
                headTarget.z = (Math.random() - 0.5) * 5; // Slight tilt

                lastLookTime = now;
                nextLookDelay = 2000 + Math.random() * 3000;
            }
            
            // Add "Breathing" sway to head so she isn't frozen
            headTarget.x += Math.sin(time * 0.5) * 2;
            headTarget.y += Math.sin(time * 0.3) * 2;
        }

        // --- 3. PHYSICS SMOOTHING (Drift towards targets) ---
        // 0.05 = Speed of head movement (Lower is smoother/heavier)
        currentEye.x += (eyeTarget.x - currentEye.x) * 0.1;
        currentEye.y += (eyeTarget.y - currentEye.y) * 0.1;
        
        currentHead.x += (headTarget.x - currentHead.x) * 0.05;
        currentHead.y += (headTarget.y - currentHead.y) * 0.05;
        currentHead.z += (headTarget.z - currentHead.z) * 0.05;


        // --- 4. APPLY TO MODEL (The Mapping) ---
        
        // A. EYES
        core.setParameterValueById('ParamEyeBallX', currentEye.x);
        core.setParameterValueById('ParamEyeBallY', currentEye.y);

        // B. HEAD ROTATION (Standard)
        core.setParameterValueById('ParamAngleX', currentHead.x);
        core.setParameterValueById('ParamAngleY', currentHead.y);
        core.setParameterValueById('ParamAngleZ', currentHead.z);

        // C. HEAD ROTATION (Your Model's "Augmented" Parameters)
        // I am mapping these based on the IDs you sent: Param53=AgX, Param55=AgY
        core.setParameterValueById('Param53', currentHead.x); // AgX
        core.setParameterValueById('Param55', currentHead.y); // AgY
        core.setParameterValueById('Param58', currentHead.z); // AGZ

        // D. BODY ROTATION (Standard)
        // Body moves slightly opposite to head (Balance) or lags behind
        let bodyX = currentHead.x * 0.5;
        let bodyY = currentHead.y * 0.2;
        
        core.setParameterValueById('ParamBodyAngleX', bodyX);
        core.setParameterValueById('ParamBodyAngleY', bodyY); // Your model has this!
        core.setParameterValueById('ParamBodyAngleZ', bodyX * 0.5); // Your model has this!

        // E. BODY ROTATION (Augmented)
        core.setParameterValueById('Param56', bodyX); // AgBodyX
        core.setParameterValueById('Param57', bodyY); // AgBodyY

        // F. BREATHING
        let breath = (Math.sin(time * 1.5) + 1) / 2; 
        core.setParameterValueById('ParamBreath', breath);

    } catch (e) { }
}

/**
 * MOUTH ANIMATION (With Pulse & Physics)
 */
function animateMouthLive2D(model, analyser, dataArray, isSpeaking) {
    if (!model || !model.internalModel) return;

    let targetOpenness = 0;
    
    if (isSpeaking && analyser) {
        analyser.getByteFrequencyData(dataArray);
        
        let low = dataArray[5];
        let mid = dataArray[15];
        let high = dataArray[30];
        let energy = (low + mid + high) / 3;

        // Pulse logic for syllables
        let pulse = (Math.sin(Date.now() / 60) * 0.2) + 0.8; 
        
        targetOpenness = (energy / 80) * pulse;

        if (targetOpenness > 1.0) targetOpenness = 1.0;
        if (targetOpenness < 0.1) targetOpenness = 0; 
    }

    let lerpFactor = (targetOpenness > currentMouth) ? 0.5 : 0.1;
    currentMouth += (targetOpenness - currentMouth) * lerpFactor;

    try { 
        model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', currentMouth); 
        let form = currentMouth * 0.5;
        model.internalModel.coreModel.setParameterValueById('ParamMouthForm', form);
    } catch (e) {}
}

/**
 * EXPRESSION TRIGGER (With Mouth Lock Fix)
 */
function setExpression(model, expName) {
    if (!model) return;
    
    const manager = model.internalModel.motionManager.expressionManager;
    if (!manager) {
        console.error("ERROR: Expression Manager is missing!");
        return;
    }

    console.log("Triggering:", expName);

    // Remove Mouth Lock if it exists in this expression
    if (manager.definitions && manager.definitions[expName]) {
        const def = manager.definitions[expName];
        def.Parameters = def.Parameters.filter(p => p.Id !== 'ParamMouthOpenY');
    }

    try {
        model.expression(expName);
    } catch(e) {
        console.error("Expression Error:", e);
    }
}