from flask import Flask, render_template
from flask_socketio import SocketIO, emit
import os
import time
import soundfile as sf
import re

# --- IMPORTS ---
from kokoro_onnx import Kokoro 
from brain import CompanionBrain

app = Flask(__name__)
# Async_mode='threading' ensures it works well on Windows without extra libraries
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# --- SETUP FOLDERS ---
audio_folder = os.path.join("static", "audio")
if not os.path.exists(audio_folder):
    os.makedirs(audio_folder)

# --- LOAD COMPONENTS ---
try:
    kokoro = Kokoro("kokoro-v0_19.onnx", "voices.bin")
    print("✔ Kokoro Voice Loaded.")
except:
    kokoro = None
    print("❌ Error: Kokoro files missing.")

try:
    brain = CompanionBrain(model_name="llama3.2")
    print("✔ Brain (Ollama) Loaded.")
except:
    brain = None
    print("❌ Error: Brain could not load.")

@app.route('/')
def index():
    return render_template('index.html')

# --- THE BACKGROUND TASK (This prevents the freeze) ---
def process_response(user_text):
    print(f"User: {user_text}")

    # 1. BRAIN THINKING
    ai_response = ""
    if brain:
        for chunk in brain.stream_response(user_text):
            ai_response += chunk
    else:
        ai_response = "I cannot think right now."

    print(f"AI: {ai_response}")

    # 2. CLEAN TEXT
    spoken_text = re.sub(r'\[\[.*?\]\]', '', ai_response).strip()

    # 3. GENERATE AUDIO
    filename = f"response_{int(time.time())}.wav"
    filepath = os.path.join(audio_folder, filename)
    audio_url = None

    if kokoro and spoken_text:
        try:
            samples, sample_rate = kokoro.create(
                spoken_text, 
                voice="af", 
                speed=1.0, 
                lang="en-us"
            )
            sf.write(filepath, samples, sample_rate)
            audio_url = f"/static/audio/{filename}"
        except Exception as e:
            print(f"Audio Error: {e}")

    # 4. SEND TO BROWSER (Using socketio.emit directly)
    # We use namespace='/' and broadcast=True to ensure it hits the user 
    # even if their socket ID changed while we were thinking.
    socketio.emit('speak_audio', {
        'url': audio_url,
        'text': ai_response 
    }, namespace='/')

@socketio.on('user_message')
def handle_message(data):
    user_text = data.get('message')
    # CHANGED: We don't do the work here anymore. 
    # We start a background task and immediately return, keeping the connection alive.
    socketio.start_background_task(process_response, user_text)

if __name__ == '__main__':
    print("--- SERVER ONLINE ---")
    socketio.run(app, debug=True)