// --- MOVEMENT LIBRARY ---

let eyeTarget = { x: 0, y: 0 };
let lastEyeMoveTime = 0;
let nextEyeMoveDelay = 2000;

/**
 * Handles Alive Animations (Eyes, Head, Arms, Hands)
 */
function animateBody(vrm, time, isSpeaking) {
    if (!vrm) return;

    // --- A. EYES (Smart Focus) ---
    if (isSpeaking) {
        // Focus on you while speaking
        eyeTarget.x = 0;
        eyeTarget.y = 0;
    } else {
        // Wander randomly while idle
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

    // --- B. HEAD (Natural Bob) ---
    const head = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.Head);
    if (head) {
        const swayAmount = isSpeaking ? 0.05 : 0.15;
        head.rotation.y = Math.sin(time * 0.3) * swayAmount + Math.sin(time * 0.7) * 0.05;
        head.rotation.x = Math.sin(time * 1.0) * 0.02;
        head.rotation.z = Math.sin(time * 0.2) * 0.03;
    }

    // --- C. ARMS & HANDS (THE NEW GESTURES) ---
    // Get all arm bones
    const lArm = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.LeftUpperArm);
    const rArm = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.RightUpperArm);
    const lForearm = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.LeftLowerArm); // Elbow
    const rForearm = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.RightLowerArm); // Elbow
    const lHand = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.LeftHand); // Wrist
    const rHand = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.RightHand); // Wrist

    // 1. BASE IDLE POSE (Relaxed Standing)
    // Z rotation: 1.3 rads (approx 75 degrees down)
    let lArmZ = 1.3; 
    let rArmZ = -1.3;
    // Elbow bend: 0.15 rads (slight natural curve)
    let lForearmZ = 0.15;
    let rForearmZ = -0.15;
    // Wrist Relax
    let lHandX = 0;
    let rHandX = 0;

    // 2. GESTURE LOGIC
    if (isSpeaking) {
        // --- TALKING STATE ---
        // Lift arms slightly (subtracting Z raises the left arm)
        // We use Math.sin(time * 3) to make them wave up and down
        lArmZ -= (0.2 + Math.sin(time * 3) * 0.05); 
        rArmZ += (0.2 + Math.cos(time * 2.5) * 0.05);

        // Bend elbows significantly to bring hands forward
        lForearmZ = 0.6 + Math.sin(time * 4) * 0.1; 
        rForearmZ = -0.6 - Math.cos(time * 3.5) * 0.1;

        // Rotate wrists/hands to emphasize words
        lHandX = Math.sin(time * 5) * 0.3;
        rHandX = Math.cos(time * 4) * 0.3;

    } else {
        // --- IDLE STATE ---
        // Add gentle breathing sway
        lArmZ += Math.sin(time) * 0.03;
        rArmZ -= Math.sin(time) * 0.03;
        
        // Tiny wrist sway
        lHandX = Math.sin(time * 1.5) * 0.1;
        rHandX = Math.cos(time * 1.5) * 0.1;
    }

    // 3. APPLY ROTATIONS
    if (lArm) lArm.rotation.z = lArmZ;
    if (rArm) rArm.rotation.z = rArmZ;
    
    // Apply elbow bend
    if (lForearm) lForearm.rotation.z = lForearmZ;
    if (rForearm) rForearm.rotation.z = rForearmZ;
    
    // Apply wrist rotation
    if (lHand) lHand.rotation.x = lHandX;
    if (rHand) rHand.rotation.x = rHandX;


    // --- D. CHEST ---
    const chest = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.Chest);
    if (chest) {
        chest.rotation.x = Math.sin(time) * 0.04;
        chest.position.y = Math.sin(time) * 0.005;
    }
}

/**
 * Handles Lip Sync
 */
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