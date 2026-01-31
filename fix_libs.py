import os
import requests

# 1. Setup Folder
js_folder = os.path.join("static", "js")
os.makedirs(js_folder, exist_ok=True)

# 2. Define URLs
files = {
    "three.module.js": "https://unpkg.com/three@0.157.0/build/three.module.js",
    "GLTFLoader.js": "https://unpkg.com/three@0.157.0/examples/jsm/loaders/GLTFLoader.js",
    "OrbitControls.js": "https://unpkg.com/three@0.157.0/examples/jsm/controls/OrbitControls.js",
    "three-vrm.module.js": "https://unpkg.com/@pixiv/three-vrm@2.0.1/lib/three-vrm.module.js",
}

print(f"Downloading and Patching libraries in {js_folder}...")

for filename, url in files.items():
    print(f"Processing {filename}...")
    
    # Download
    r = requests.get(url)
    content = r.text
    
    # --- THE FIX: REWRITE IMPORTS ---
    # We replace generic imports with specific local paths.
    
    # 1. Point generic 'three' to our local file
    content = content.replace("from 'three';", "from './three.module.js';")
    content = content.replace('from "three";', 'from "./three.module.js";')
    
    # 2. Fix relative path madness (../../../) often found in these files
    content = content.replace("from '../../../build/three.module.js';", "from './three.module.js';")
    
    # 3. Save the patched file
    with open(os.path.join(js_folder, filename), 'w', encoding='utf-8') as f:
        f.write(content)

print("\nDONE! All libraries are patched to work offline.")