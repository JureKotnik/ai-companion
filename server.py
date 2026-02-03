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
    return render_template('live2d.html')

@app.route('/3d')
def live2d_page():
    return render_template('index.html')

def process_response(user_text):
    print(f"User: {user_text}")

    ai_response = ""
    if brain:
        for chunk in brain.stream_response(user_text):
            ai_response += chunk
    else:
        ai_response = "I cannot think right now."

    print(f"AI Raw: {ai_response}")

    # --- 1. SMARTER SPLITTING ---
    # Split by ANY content inside brackets [] or asterisks **
    # This catches [Smiling slightly] or [Tears up]
    segments = re.split(r'(\[[^\]]+\]|\*[^\*]+\*)', ai_response)
    
    playlist = []
    current_emotion = "Reset" # Default start
    
    # Define keywords to map "creative" tags to your actual files
    emotion_map = {
        "happy": "Happy", "smile": "Happy", "smiling": "Smiling",
        "sad": "Sad", "cry": "Cry", "tear": "Cry", "depressed": "Sad",
        "angry": "Angry", "mad": "Angry",
        "love": "Love", "blush": "Love",
        "nervous": "Nervous", "scared": "Scared",
        "sleepy": "Sleepy", "tired": "Sleepy",
        "amazed": "Amazed", "wow": "Amazed",
        "confused": "Confused", "thinking": "Thinking",
        "laugh": "Laughing", "haha": "Laughing"
    }

    for segment in segments:
        segment = segment.strip()
        if not segment: continue
        
        # Check if this segment is a TAG (starts with [ or *)
        is_tag = re.match(r'^[\*\[].*[\*\]]$', segment)
        
        if is_tag:
            # Clean the tag (remove brackets and lowercase)
            # "[Smiling slightly]" -> "smiling slightly"
            raw_tag = re.sub(r'[\*\[\]]', '', segment).lower()
            
            found_match = False
            # Check if any keyword exists in the tag
            for key, val in emotion_map.items():
                if key in raw_tag:
                    current_emotion = val
                    found_match = True
                    break
            
            # If the tag was "Pauses and looks down" (no match), we usually Reset
            if not found_match:
                current_emotion = "Reset"
                
        else:
            # It is text! Generate audio.
            clean_text = re.sub(r'\[\[.*?\]\]', '', segment).strip()
            # Remove punctuation-only segments (like "...")
            if not re.search(r'[a-zA-Z0-9]', clean_text): continue
            
            filename = f"seq_{int(time.time())}_{len(playlist)}.wav"
            filepath = os.path.join(audio_folder, filename)
            
            audio_url = None
            if kokoro:
                try:
                    samples, sample_rate = kokoro.create(
                        clean_text, 
                        voice="af", 
                        speed=1.0, 
                        lang="en-us"
                    )
                    sf.write(filepath, samples, sample_rate)
                    audio_url = f"/static/audio/{filename}"
                except Exception as e:
                    print(f"Audio Error: {e}")

            playlist.append({
                'text': clean_text,
                'audio': audio_url,
                'emotion': current_emotion
            })

    # Send the WHOLE playlist to the frontend
    socketio.emit('speak_audio_sequence', playlist, namespace='/')

@socketio.on('user_message')
def handle_message(data):
    user_text = data.get('message')
    socketio.start_background_task(process_response, user_text)

if __name__ == '__main__':
    print("--- SERVER ONLINE ---")
    socketio.run(app, debug=True)