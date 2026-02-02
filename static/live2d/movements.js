// --- LIVE2D MOVEMENT LIBRARY ---

function animateLive2D(model, time, isSpeaking) {
    if (!model || !model.internalModel) return;

    try {
        if (!isSpeaking) {
            
            let swayX = Math.sin(time * 0.5) * 5; 
            let swayY = Math.sin(time * 0.8) * 5;
            let swayZ = Math.sin(time * 0.3) * 2;

            model.internalModel.coreModel.setParameterValueById('ParamAngleX', swayX);
            model.internalModel.coreModel.setParameterValueById('ParamAngleY', swayY);
            model.internalModel.coreModel.setParameterValueById('ParamAngleZ', swayZ);
            model.internalModel.coreModel.setParameterValueById('ParamBodyAngleX', swayX * 0.5);
        } else {
            model.internalModel.coreModel.setParameterValueById('ParamAngleX', 0);
            model.internalModel.coreModel.setParameterValueById('ParamAngleY', 0);
            model.internalModel.coreModel.setParameterValueById('ParamAngleZ', 0);
        }
    } catch (e) {
        
    }
}

function animateMouthLive2D(model, analyser, dataArray, isSpeaking) {
    if (!model || !model.internalModel) return;

    if (!isSpeaking || !analyser) {
        try { model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', 0); } catch(e){}
        return;
    }

    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for(let i = 5; i < 20; i++) sum += dataArray[i];
    let vol = sum / 15;
    let openness = (vol > 10) ? (vol / 100) : 0;
    if (openness > 1.0) openness = 1.0;
    try { 
        model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', openness); 
    } catch (e) {}
}