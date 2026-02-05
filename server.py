from flask import Flask, render_template
from flask_socketio import SocketIO, emit
import os
import time
import soundfile as sf
import re
from kokoro_onnx import Kokoro 
from brain import CompanionBrain
import whisper
import sys
import tempfile

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# --- AUDIO SETUP ---
audio_folder = os.path.join("static", "audio")
if not os.path.exists(audio_folder):
    os.makedirs(audio_folder)

# CLEANUP: Delete old files on startup (Safe)
for f in os.listdir(audio_folder):
    if f.endswith(".wav"):
        try:
            os.remove(os.path.join(audio_folder, f))
        except: pass

# --- LOAD AI MODELS ---
try:
    kokoro = Kokoro("kokoro-v0_19.onnx", "voices.bin")
    print("✔ Kokoro Voice Loaded.")
except:
    kokoro = None
    print("❌ Error: Kokoro files missing.")

try:
    # Use 'tiny.en' for speed, or 'base' for accuracy
    stt_model = whisper.load_model("tiny.en")
    print("✔ Whisper STT Loaded.")
except Exception as e:
    stt_model = None
    print(f"❌ Error loading Whisper: {e}")

try:
    # Use llama3.1 if your GPU can handle it, otherwise llama3.2
    brain = CompanionBrain(model_name="llama3.1") 
    print("✔ Brain (Ollama) Loaded.")
except:
    brain = None
    print("❌ Error: Brain could not load.")

# --- ROUTES ---
@app.route('/')
def index():
    return render_template('live2d.html')

@app.route('/3d')
def live2d_page():
    return render_template('index.html')

# --- LOGIC ---
def process_response(user_text):
    print(f"\nUser: {user_text}")
    print("AI: ", end="", flush=True)

    emotion_map = {
        "happy": "Happy", "smile": "Happy", "smiling": "Smiling",
        "sad": "Sad", "cry": "Cry", "depressed": "Sad",
        "angry": "Angry", "mad": "Angry",
        "wink": "Wink", "flirt": "Wink",
        "love": "Love", "blush": "Love", "shy": "Embarrassed",
        "nervous": "Nervous", "scared": "Scared",
        "sleepy": "Sleepy", "tired": "Sleepy",
        "amazed": "Amazed", "wow": "Amazed", "surprised": "Surprised",
        "confused": "Confused", "thinking": "Thinking",
        "laugh": "Laughing", "haha": "Laughing",
        "bored": "Bored", "determined": "Determined",
        "disgusted": "Disgusted", "eww": "Disgusted",
        "disappointed": "Disappointed", "sigh": "Disappointed",
        "sneeze": "Sneeze", "shocked": "Shocked"
    }

    if brain:
        buffer = ""
        current_emotion = None 

        for chunk in brain.stream_response(user_text):
            buffer += chunk
            sys.stdout.write(chunk)
            sys.stdout.flush()
            
            if re.search(r'[.!?;:]', chunk):
                parts = re.split(r'([.!?;:])', buffer)
                buffer = "" 
                
                sentences = ["".join(x) for x in zip(parts[0::2], parts[1::2])]
                
                playlist = []
                
                for sentence in sentences:
                    sentence = sentence.strip()
                    if not sentence: continue

                    # 1. EMOTION PARSER
                    tag_match = re.search(r'[\*\[](.*?)[\*\]]', sentence)
                    if tag_match:
                        raw_tag = tag_match.group(1).lower()
                        for key, val in emotion_map.items():
                            if key in raw_tag:
                                current_emotion = val
                                break

                    # 2. COMMANDS
                    if "[[OPEN:" in sentence:
                        continue

                    # 3. CLEAN AUDIO TEXT
                    audio_text = re.sub(r'[\*\[].*?[\*\]]', '', sentence)
                    audio_text = re.sub(r'[^\w\s,.!?;:\']', '', audio_text)
                    audio_text = re.sub(r'\bIT\b', 'it', audio_text)
                    audio_text = re.sub(r'\bAM\b', 'am', audio_text)
                    audio_text = audio_text.strip()

                    if not any(c.isalnum() for c in audio_text):
                        continue 

                    # 4. GENERATE FILE
                    filename = f"seq_{int(time.time())}_{len(playlist)}.wav"
                    filepath = os.path.join(audio_folder, filename)
                    audio_url = None

                    if kokoro:
                        try:
                            samples, sample_rate = kokoro.create(
                                audio_text, voice="af", speed=1.0, lang="en-us"
                            )
                            sf.write(filepath, samples, sample_rate)
                            audio_url = f"/static/audio/{filename}"
                        except Exception as e:
                            print(f"Audio Error: {e}")

                    playlist.append({
                        'text': sentence,
                        'audio': audio_url,
                        'emotion': current_emotion
                    })

                if playlist:
                    socketio.emit('speak_audio_sequence', playlist, namespace='/')
        print("")
        socketio.emit('ai_response_done', namespace='/')

@socketio.on('user_message')
def handle_message(data):
    user_text = data.get('message')
    socketio.start_background_task(process_response, user_text)

@socketio.on('audio_stream')
def handle_audio_stream(audio_data):
    if not stt_model:
        emit('error', {'message': "Whisper is not loaded."})
        return

    try:
        # Standard Temp File Handling
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as temp_audio:
            temp_audio.write(audio_data)
            temp_path = temp_audio.name
        
        print(f"🎤 Processing Audio...")
        result = stt_model.transcribe(temp_path, fp16=False) 
        text = result['text'].strip()
        
        os.remove(temp_path) # Clean up temp input
        
        if text:
            print(f"🎤 Heard: {text}")
            socketio.start_background_task(process_response, text)
        else:
            print("🎤 Heard Silence.")
            emit('error', {'message': "Could not understand audio."})

    except Exception as e:
        print(f"❌ STT Error: {e}")
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.remove(temp_path)

# --- NEW: DELETE HANDLER (Safe) ---
@socketio.on('delete_audio')
def handle_delete_audio(data):
    filename_url = data.get('filename')
    if not filename_url: return
    
    clean_name = os.path.basename(filename_url)
    file_path = os.path.join(audio_folder, clean_name)

    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except: pass

if __name__ == '__main__':
    print("--- SERVER ONLINE ---")
    socketio.run(app, debug=True)