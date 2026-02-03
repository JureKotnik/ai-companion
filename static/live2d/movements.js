// --- LIVE2D MOVEMENT LIBRARY ---

let eyeTarget = { x: 0, y: 0 };
let currentEye = { x: 0, y: 0 }; 

let currentMouth = 0;

let lastLookTime = 0;
let nextLookDelay = 2000;

let blinkState = 0; 
let nextBlinkTime = 0;
let blinkValue = 1.0; 

function animateLive2D(model, time, isSpeaking) {
    if (!model || !model.internalModel) return;

    try {
        const core = model.internalModel.coreModel;

        let now = Date.now();
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

        if (isSpeaking) {
            eyeTarget.x = 0; eyeTarget.y = 0;
        } else {
            if (now - lastLookTime > nextLookDelay) {
                eyeTarget.x = (Math.random() - 0.5) * 1.5; 
                eyeTarget.y = (Math.random() - 0.5) * 1.0;
                lastLookTime = now;
                nextLookDelay = 2000 + Math.random() * 3000;
            }
        }
        currentEye.x += (eyeTarget.x - currentEye.x) * 0.05;
        currentEye.y += (eyeTarget.y - currentEye.y) * 0.05;

        core.setParameterValueById('ParamEyeBallX', currentEye.x);
        core.setParameterValueById('ParamEyeBallY', currentEye.y);

        if (!isSpeaking) {
            let headX = Math.sin(time * 0.5) * 8;
            let headY = Math.sin(time * 0.8) * 5;
            let headZ = Math.sin(time * 0.3) * 3;
            core.setParameterValueById('ParamAngleX', headX);
            core.setParameterValueById('ParamAngleY', headY);
            core.setParameterValueById('ParamAngleZ', headZ);
            core.setParameterValueById('ParamBodyAngleX', -headX * 0.2);
        } else {
            core.setParameterValueById('ParamAngleX', Math.sin(time * 2) * 2); 
            core.setParameterValueById('ParamAngleY', 0);
            core.setParameterValueById('ParamAngleZ', 0);
        }

        let breath = (Math.sin(time * 1.5) + 1) / 2; 
        core.setParameterValueById('ParamBreath', breath);
    } catch (e) { }
}

let speechTime = 0;

function animateMouthLive2D(model, analyser, dataArray, isSpeaking) {
    if (!model || !model.internalModel) return;

    let targetOpenness = 0;
    
    if (isSpeaking && analyser) {
        analyser.getByteFrequencyData(dataArray);
        
        let low = dataArray[5];
        let mid = dataArray[15];
        let high = dataArray[30];
        
        let energy = (low + mid + high) / 3;

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

function setExpression(model, expName) {
    if (!model) return;
    
    const manager = model.internalModel.motionManager.expressionManager;
    if (!manager) {
        console.error("ERROR: Expression Manager is missing!");
        return;
    }

    console.log("Attempting to trigger:", expName);
    
    if (manager.definitions && manager.definitions[expName]) {
        const def = manager.definitions[expName];
        const originalLength = def.Parameters.length;
        def.Parameters = def.Parameters.filter(p => p.Id !== 'ParamMouthOpenY');
        
        if (def.Parameters.length < originalLength) {
            console.log(`(Fixed) Removed Mouth Lock from ${expName}`);
        }
    }

    try {
        model.expression(expName);
    } catch(e) {
        console.error("Expression Error:", e);
    }
}