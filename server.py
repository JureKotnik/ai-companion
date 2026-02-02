from flask import Flask, render_template
from flask_socketio import SocketIO, emit
import os
import time
import soundfile as sf
import re
from kokoro_onnx import Kokoro 
from brain import CompanionBrain

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

audio_folder = os.path.join("static", "audio")
if not os.path.exists(audio_folder):
    os.makedirs(audio_folder)

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

@app.route('/2d')
def live2d_page():
    return render_template('live2d.html')

def process_response(user_text):
    print(f"User: {user_text}")

    ai_response = ""
    if brain:
        for chunk in brain.stream_response(user_text):
            ai_response += chunk
    else:
        ai_response = "I cannot think right now."

    print(f"AI: {ai_response}")

    spoken_text = re.sub(r'\[\[.*?\]\]', '', ai_response).strip()

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

    socketio.emit('speak_audio', {
        'url': audio_url,
        'text': ai_response 
    }, namespace='/')

@socketio.on('user_message')
def handle_message(data):
    user_text = data.get('message')
    socketio.start_background_task(process_response, user_text)

if __name__ == '__main__':
    print("--- SERVER ONLINE ---")
    socketio.run(app, debug=True)