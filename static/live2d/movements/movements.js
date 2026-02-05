
let eyeTarget = { x: 0, y: 0 };
let currentEye = { x: 0, y: 0 }; 

let currentMouth = 0;
let speechTime = 0;

let headTarget = { x: 0, y: 0, z: 0 };
let currentHead = { x: 0, y: 0, z: 0 };

let lastLookTime = 0;
let nextLookDelay = 2000;
let blinkState = 0; 
let nextBlinkTime = 0;
let blinkValue = 1.0; 

let lastInteractionTime = Date.now();
let idleState = 0;

function resetIdleTimer() {
    lastInteractionTime = Date.now();
    if (idleState !== 0) {
        console.log("Wake up! Engaging...");
        idleState = 0;
    }
}

function animateLive2D(model, time, isSpeaking) {
    if (!model || !model.internalModel) return;

    window.currentModel = model; 

    try {
        const core = model.internalModel.coreModel;
        let now = Date.now();

        if (!isSpeaking) {
            let timeSinceAction = now - lastInteractionTime;

            if (timeSinceAction > 15000 && idleState < 1) {
                console.log("Idle: Relaxing face...");
                setExpression(model, 'Reset');
                idleState = 1; 
            }

            if (timeSinceAction > 45000 && idleState < 2) {
                console.log("Idle: Getting bored...");
                setExpression(model, 'Bored');
                idleState = 2;
            }

            if (timeSinceAction > 120000 && idleState < 3) {
                console.log("Idle: Falling asleep...");
                setExpression(model, 'Sleepy');
                idleState = 3;
            }
        } else {
            resetIdleTimer();
        }

        let blinkSpeed = (idleState === 3) ? 0.05 : 0.15;
        let blinkInterval = (idleState === 3) ? 4000 : 2000;

        if (now > nextBlinkTime) {
            blinkState = 1; 
            nextBlinkTime = now + blinkInterval + Math.random() * 2000;
        }
        if (blinkState === 1) { 
            blinkValue -= blinkSpeed;
            if (blinkValue <= 0) { blinkValue = 0; blinkState = 2; }
        } else if (blinkState === 2) { 
            blinkValue += blinkSpeed;
            if (blinkValue >= 1) { blinkValue = 1; blinkState = 0; }
        }
        core.setParameterValueById('ParamEyeLOpen', blinkValue);
        core.setParameterValueById('ParamEyeROpen', blinkValue);


        if (isSpeaking) {
            eyeTarget.x = 0; eyeTarget.y = 0;
            headTarget.x = Math.sin(time * 2) * 2; 
            headTarget.y = Math.sin(time * 1.5) * 2;
            headTarget.z = Math.sin(time) * 1;
        } else {
            if (now - lastLookTime > nextLookDelay) {
                if (idleState === 3) {
                    eyeTarget.x = 0; 
                    eyeTarget.y = -0.5;
                    headTarget.y = -10; 
                    headTarget.z = 5;   
                } else if (idleState === 2) {

                    eyeTarget.x = 1.0; 
                    headTarget.x = 15; 
                    headTarget.z = -5; 
                } else {
                    eyeTarget.x = (Math.random() - 0.5) * 2.0; 
                    eyeTarget.y = (Math.random() - 0.5) * 1.0;
                    headTarget.x = eyeTarget.x * 15; 
                    headTarget.y = eyeTarget.y * 10;
                    headTarget.z = (Math.random() - 0.5) * 5;
                }
                lastLookTime = now;
                nextLookDelay = 2000 + Math.random() * 3000;
            }
            
            if (idleState !== 3) {
                headTarget.x += Math.sin(time * 0.5) * 2;
                headTarget.y += Math.sin(time * 0.3) * 2;
            }
        }

        currentEye.x += (eyeTarget.x - currentEye.x) * 0.1;
        currentEye.y += (eyeTarget.y - currentEye.y) * 0.1;
        
        let headSpeed = (idleState === 3) ? 0.01 : 0.05;

        currentHead.x += (headTarget.x - currentHead.x) * headSpeed;
        currentHead.y += (headTarget.y - currentHead.y) * headSpeed;
        currentHead.z += (headTarget.z - currentHead.z) * headSpeed;

        core.setParameterValueById('ParamEyeBallX', currentEye.x);
        core.setParameterValueById('ParamEyeBallY', currentEye.y);

        core.setParameterValueById('ParamAngleX', currentHead.x);
        core.setParameterValueById('ParamAngleY', currentHead.y);
        core.setParameterValueById('ParamAngleZ', currentHead.z);

        core.setParameterValueById('Param53', currentHead.x);
        core.setParameterValueById('Param55', currentHead.y);
        core.setParameterValueById('Param58', currentHead.z);

        let bodyX = currentHead.x * 0.5;
        let bodyY = currentHead.y * 0.2;
        core.setParameterValueById('ParamBodyAngleX', bodyX);
        core.setParameterValueById('ParamBodyAngleY', bodyY); 
        core.setParameterValueById('ParamBodyAngleZ', bodyX * 0.5);
        core.setParameterValueById('Param56', bodyX); 
        core.setParameterValueById('Param57', bodyY); 

        let breathSpeed = (idleState === 3) ? 0.5 : 1.5;
        let breath = (Math.sin(time * breathSpeed) + 1) / 2; 
        core.setParameterValueById('ParamBreath', breath);

    } catch (e) { }
}

let currentMouthForm = 0;

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
        let rawVolume = Math.max(0, average - 20) / 40; 
        targetOpenness = rawVolume * rawVolume * 1.5; 

        if (targetOpenness < 0.15) targetOpenness = 0;
        if (targetOpenness > 1.0) targetOpenness = 1.0;
        if (targetOpenness > 0.3) targetForm = 0.3;

    } else {
        targetOpenness = 0;
        targetForm = 0;
    }

    let closeSpeed = 0.9;
    let openSpeed = 0.8;
    
    let speed = (targetOpenness > currentMouth) ? openSpeed : closeSpeed;
    currentMouth += (targetOpenness - currentMouth) * speed;

    currentMouthForm += (targetForm - currentMouthForm) * 0.2;

    try {
        const core = model.internalModel.coreModel;
        
        core.setParameterValueById('ParamMouthOpenY', currentMouth);
        core.setParameterValueById('ParamMouthForm', currentMouthForm);
    } catch (e) {}
}

function setExpression(model, expName) {
    if (!model) return;
    const manager = model.internalModel.motionManager.expressionManager;
    if (!manager) { console.error("ERROR: Expression Manager missing!"); return; }
    console.log("Triggering:", expName);
    
    if (expName !== 'Reset' && expName !== 'Bored' && expName !== 'Sleepy') {
        resetIdleTimer(); 
    }

    if (manager.definitions && manager.definitions[expName]) {
        const def = manager.definitions[expName];
        def.Parameters = def.Parameters.filter(p => p.Id !== 'ParamMouthOpenY');
    }
    try { model.expression(expName); } catch(e) { console.error("Expression Error:", e); }
}