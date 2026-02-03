// --- MOVEMENT LIBRARY ---

let eyeTarget = { x: 0, y: 0 };
let lastEyeMoveTime = 0;
let nextEyeMoveDelay = 2000;

function animateBody(vrm, time, isSpeaking) {
    if (!vrm) return;

    if (isSpeaking) {
        eyeTarget.x = 0;
        eyeTarget.y = 0;
    } else {
        if (Date.now() - lastEyeMoveTime > nextEyeMoveDelay) {
            eyeTarget.x = (Math.random() - 0.5) * 0.4;
            eyeTarget.y = (Math.random() - 0.5) * 0.2;
            lastEyeMoveTime = Date.now();
            nextEyeMoveDelay = 1000 + Math.random() * 3000;
        }
    }

    const leftEye = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.LeftEye);
    const rightEye = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.RightEye);

    if (leftEye && rightEye) {
        const speed = isSpeaking ? 0.2 : 0.05;
        leftEye.rotation.y += (eyeTarget.x - leftEye.rotation.y) * speed;
        leftEye.rotation.x += (eyeTarget.y - leftEye.rotation.x) * speed;
        rightEye.rotation.y = leftEye.rotation.y;
        rightEye.rotation.x = leftEye.rotation.x;
    }

    const head = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.Head);
    if (head) {
        const swayAmount = isSpeaking ? 0.05 : 0.15;
        head.rotation.y = Math.sin(time * 0.3) * swayAmount + Math.sin(time * 0.7) * 0.05;
        head.rotation.x = Math.sin(time * 1.0) * 0.02;
        head.rotation.z = Math.sin(time * 0.2) * 0.03;
    }

    const lArm = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.LeftUpperArm);
    const rArm = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.RightUpperArm);
    const lForearm = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.LeftLowerArm);
    const rForearm = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.RightLowerArm);
    const lHand = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.LeftHand);
    const rHand = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.RightHand);

    let lArmZ = 1.3; 
    let rArmZ = -1.3;
    let lForearmZ = 0.15;
    let rForearmZ = -0.15;
    let lHandX = 0;
    let rHandX = 0;

    if (isSpeaking) {
        lArmZ -= (0.2 + Math.sin(time * 3) * 0.05); 
        rArmZ += (0.2 + Math.cos(time * 2.5) * 0.05);

        lForearmZ = 0.6 + Math.sin(time * 4) * 0.1; 
        rForearmZ = -0.6 - Math.cos(time * 3.5) * 0.1;

        lHandX = Math.sin(time * 5) * 0.3;
        rHandX = Math.cos(time * 4) * 0.3;

    } else {
        lArmZ += Math.sin(time) * 0.03;
        rArmZ -= Math.sin(time) * 0.03;
        
        lHandX = Math.sin(time * 1.5) * 0.1;
        rHandX = Math.cos(time * 1.5) * 0.1;
    }

    if (lArm) lArm.rotation.z = lArmZ;
    if (rArm) rArm.rotation.z = rArmZ;
    
    if (lForearm) lForearm.rotation.z = lForearmZ;
    if (rForearm) rForearm.rotation.z = rForearmZ;
    
    if (lHand) lHand.rotation.x = lHandX;
    if (rHand) rHand.rotation.x = rHandX;

    const chest = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.Chest);
    if (chest) {
        chest.rotation.x = Math.sin(time) * 0.04;
        chest.position.y = Math.sin(time) * 0.005;
    }
}

function animateMouth(vrm, analyser, dataArray, isSpeaking) {
    if (!vrm) return;
    if (!isSpeaking || !analyser) {
        currentVrm.blendShapeProxy.setValue(THREE.VRMSchema.BlendShapePresetName.A, 0);
        return;
    }
    analyser.getByteFrequencyData(dataArray);
    let low = dataArray[5], mid = dataArray[15], high = dataArray[30];
    let energy = (low * 1.5 + mid + high * 0.5) / 3;
    let noise = 0.8 + (Math.random() * 0.4); 
    let targetOpenness = (energy / 350) * noise;
    if (energy > 20 && targetOpenness < 0.05) targetOpenness = 0.05;
    if (targetOpenness > 0.5) targetOpenness = 0.5;
    vrm.blendShapeProxy.setValue(THREE.VRMSchema.BlendShapePresetName.A, targetOpenness);
}