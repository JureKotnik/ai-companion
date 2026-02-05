from flask import Flask, render_template
from flask_socketio import SocketIO, emit
import os
import time
import soundfile as sf
import re
import random
from kokoro_onnx import Kokoro 
from brain import CompanionBrain
import whisper
import sys
import tempfile

# IMPORT CONFIGURATION
from config import EMOTION_MAP, SOUND_BANK, BREATH_SOUNDS, FILLERS, PHONETIC_MAP

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

audio_folder = os.path.join("static", "audio")
if not os.path.exists(audio_folder): os.makedirs(audio_folder)

# --- LOAD MODELS ---
try: kokoro = Kokoro("kokoro-v0_19.onnx", "voices.bin"); print("✔ Kokoro Loaded.")
except: kokoro = None
try: stt_model = whisper.load_model("tiny.en"); print("✔ Whisper Loaded.")
except: stt_model = None
try: brain = CompanionBrain(model_name="llama3.1"); print("✔ Brain Loaded.")
except: brain = None

# GLOBAL TIMESTAMP (Lag Fix)
last_request_time = 0  

@app.route('/')
def index(): return render_template('live2d.html')

def generate_kokoro_audio(text, filename):
    if not kokoro: return None
    try:
        filepath = os.path.join(audio_folder, filename)
        samples, sample_rate = kokoro.create(text, voice="af", speed=1.0, lang="en-us")
        sf.write(filepath, samples, sample_rate)
        return f"/static/audio/{filename}"
    except Exception as e: return None

# --- TEXT CLEANING ---
def clean_for_speech(text):
    # Uses dictionary from config.py
    for word, replacement in PHONETIC_MAP.items():
        text = re.sub(r'\b' + re.escape(word) + r'\b', replacement, text, flags=re.IGNORECASE)
    return text

def process_response(user_text, my_start_time):
    global last_request_time
    if my_start_time < last_request_time: return

    print(f"\nUser: {user_text}")
    print("AI: ", end="", flush=True)

    if brain:
        buffer = ""
        current_emotion = None 
        
        # --- INSTANT FILLER (30% Chance) ---
        if random.random() < 0.3:
            if my_start_time < last_request_time: return
            # Uses FILLERS from config.py
            filler = random.choice(FILLERS)
            filler_url = generate_kokoro_audio(filler, f"filler_{int(time.time())}.wav")
            if filler_url:
                socketio.emit('speak_audio_sequence', [{'text': "...", 'audio': filler_url, 'emotion': "Thinking"}], namespace='/')

        for chunk in brain.stream_response(user_text):
            if my_start_time < last_request_time: return 

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
                    
                    # 1. EMOTION PARSING (Uses EMOTION_MAP from config)
                    for key, val in EMOTION_MAP.items():
                        if key in sentence.lower(): current_emotion = val
                    
                    # 2. CLEAN TEXT
                    audio_text = re.sub(r'[\*\[].*?[\*\]]', '', sentence)
                    audio_text = re.sub(r'[^\w\s,.!?;:\']', '', audio_text).strip()
                    if not audio_text: continue
                    audio_text = clean_for_speech(audio_text)

                    # 3. INJECT SOUNDS (Uses SOUND_BANK from config)
                    
                    # A. Emotional Reaction
                    if current_emotion in SOUND_BANK and random.random() < 0.4:
                        sound = random.choice(SOUND_BANK[current_emotion])
                        audio_text = f"{sound} {audio_text}"
                    
                    # B. Breathing Engine
                    elif len(audio_text.split()) > 6 and random.random() < 0.3:
                        breath = random.choice(BREATH_SOUNDS)
                        audio_text = f"{breath} {audio_text}"

                    # C. Conversation Fillers
                    elif random.random() < 0.15:
                         # Mix Hesitation & Agreement from config
                         filler = random.choice(SOUND_BANK["Hesitation"] + SOUND_BANK["Agreement"])
                         audio_text = f"{filler} {audio_text}"

                    # 4. GENERATE
                    filename = f"seq_{int(time.time())}_{len(playlist)}.wav"
                    audio_url = generate_kokoro_audio(audio_text, filename)
                    
                    playlist.append({'text': sentence, 'audio': audio_url, 'emotion': current_emotion})

                if playlist:
                    if my_start_time < last_request_time: return
                    socketio.emit('speak_audio_sequence', playlist, namespace='/')
        
    print("")
    if my_start_time >= last_request_time:
        socketio.emit('ai_response_done', namespace='/') 

@socketio.on('user_message')
def handle_message(data):
    global last_request_time
    last_request_time = time.time()
    socketio.start_background_task(process_response, data.get('message'), last_request_time)

@socketio.on('audio_stream')
def handle_audio_stream(audio_data):
    global last_request_time
    last_request_time = time.time() 
    
    if not stt_model: return
    try:
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as temp:
            temp.write(audio_data)
            temp_path = temp.name
        
        result = stt_model.transcribe(temp_path, fp16=False) 
        text = result['text'].strip()
        os.remove(temp_path)
        
        if text:
            socketio.start_background_task(process_response, text, last_request_time)
        else:
            emit('error', {'message': "???"})
    except: pass

@socketio.on('interrupt_signal')
def handle_interrupt():
    global last_request_time
    last_request_time = time.time() # Kill current task
    print("--- INTERRUPT SIGNAL ---")

@socketio.on('delete_audio')
def handle_delete_audio(data):
    filename = data.get('filename')
    if filename:
        try: os.remove(os.path.join(audio_folder, os.path.basename(filename)))
        except: pass

if __name__ == '__main__':
    socketio.run(app, debug=True)