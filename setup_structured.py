import os
import requests

# 1. Setup specific subfolders to match Three.js structure
# This allows relative imports (like "../utils/") to work naturally.
base_dir = "static/js"
dirs = {
    "root": base_dir,
    "loaders": os.path.join(base_dir, "loaders"),
    "utils": os.path.join(base_dir, "utils"),
    "libs": os.path.join(base_dir, "libs") # For meshopt/draco if needed later
}

for d in dirs.values():
    os.makedirs(d, exist_ok=True)

# 2. Define URLs (Modern r160 + VRM 2.1)
# Note: We download them into the exact folder structure they expect.
files = {
    # Core
    "three.module.js": {
        "url": "https://unpkg.com/three@0.160.0/build/three.module.js",
        "path": os.path.join(dirs["root"], "three.module.js")
    },
    # Loader (goes into /loaders/)
    "GLTFLoader.js": {
        "url": "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js",
        "path": os.path.join(dirs["loaders"], "GLTFLoader.js")
    },
    # Utils (goes into /utils/ - THIS WAS THE MISSING PIECE)
    "BufferGeometryUtils.js": {
        "url": "https://unpkg.com/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js",
        "path": os.path.join(dirs["utils"], "BufferGeometryUtils.js")
    },
    # VRM (goes into root)
    "three-vrm.module.js": {
        "url": "https://unpkg.com/@pixiv/three-vrm@2.1.0/lib/three-vrm.module.js",
        "path": os.path.join(dirs["root"], "three-vrm.module.js")
    }
}

print(f"--- DOWNLOADING LIBRARIES WITH STRUCTURE ---")

for name, info in files.items():
    print(f"Fetching {name}...")
    try:
        r = requests.get(info["url"])
        with open(info["path"], 'wb') as f:
            f.write(r.content)
    except Exception as e:
        print(f"  - Error: {e}")

print("\n--- DONE. Folder structure created correctly. ---")