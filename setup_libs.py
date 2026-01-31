import os
import requests

# Define the local folder
js_folder = os.path.join("static", "js")
os.makedirs(js_folder, exist_ok=True)

# The EXACT versions that work together
files = {
    "three.module.js": "https://unpkg.com/three@0.157.0/build/three.module.js",
    "GLTFLoader.js": "https://unpkg.com/three@0.157.0/examples/jsm/loaders/GLTFLoader.js",
    "OrbitControls.js": "https://unpkg.com/three@0.157.0/examples/jsm/controls/OrbitControls.js",
    "three-vrm.module.js": "https://unpkg.com/@pixiv/three-vrm@2.0.1/lib/three-vrm.module.js",
    # --- NEW: The missing file ---
    "BufferGeometryUtils.js": "https://unpkg.com/three@0.157.0/examples/jsm/utils/BufferGeometryUtils.js"
}

print(f"Downloading libraries to {js_folder}...")

for filename, url in files.items():
    print(f" - Fetching {filename}...")
    try:
        r = requests.get(url)
        with open(os.path.join(js_folder, filename), 'wb') as f:
            f.write(r.content)
    except Exception as e:
        print(f"Failed to download {filename}: {e}")

print("\nDONE! Run server.py now.")