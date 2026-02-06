from flask import Flask, render_template
from flask_socketio import SocketIO, emit
import os
import time
import soundfile as sf
import re
import random
import numpy as np
from kokoro_onnx import Kokoro 
from brain import CompanionBrain
import whisper
import sys
import tempfile

# --- IMPORT CONFIGURATION ---
import config
EMOTION_MAP = getattr(config, 'EMOTION_MAP', {})
SOUND_BANK = getattr(config, 'SOUND_BANK', {})
BREATH_SOUNDS = getattr(config, 'BREATH_SOUNDS', [])
PHONETIC_MAP = getattr(config, 'PHONETIC_MAP', {})
TEST_MODE = getattr(config, 'TEST_MODE', True)
FILLERS = getattr(config, 'FILLERS', ["Hmm?", "Let's see..."]) 
VOICE_STYLES = getattr(config, 'VOICE_STYLES', {}) 
QUIET_TRIGGERS = getattr(config, 'QUIET_TRIGGERS', ["quiet mode", "shh"])
NORMAL_TRIGGERS = getattr(config, 'NORMAL_TRIGGERS', ["normal mode", "speak up"])

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

audio_folder = os.path.join("static", "audio")
if not os.path.exists(audio_folder): os.makedirs(audio_folder)

# --- GLOBAL STATE ---
IS_QUIET_MODE = False  # Default: Normal volume

# --- LOAD MODELS ---
try: kokoro = Kokoro("kokoro-v0_19.onnx", "voices.bin"); print("✔ Kokoro Loaded.")
except: kokoro = None
try: stt_model = whisper.load_model("tiny.en"); print("✔ Whisper Loaded.")
except: stt_model = None
try: brain = CompanionBrain(model_name="llama3.1"); print("✔ Brain Loaded.")
except: brain = None

if TEST_MODE:
    print("\n⚠️  WARNING: TEST MODE IS ON. Memory will not be saved. ⚠️\n")

last_request_time = 0  

@app.route('/')
def index(): return render_template('live2d.html')

@app.route('/favicon.ico')
def favicon(): return "", 204

def generate_kokoro_audio(text, filename, emotion=None):
    if not kokoro: return None
    try:
        filepath = os.path.join(audio_folder, filename)
        
        # DEFAULTS
        voice_name = "af" 
        speed = 1.0       
        volume = 1.0      

        # 1. CHECK QUIET MODE OVERRIDE
        if IS_QUIET_MODE:
            # Use Config if available, otherwise use HARDCODED preference
            if "Whisper" in VOICE_STYLES:
                style = VOICE_STYLES["Whisper"]
            else:
                # FALLBACK: Speed 0.95 (Fast), Volume 0.3 (Quiet)
                style = ("af", 0.95, 0.3) 
        
        # 2. OR USE EMOTION STYLE
        elif emotion in VOICE_STYLES:
            style = VOICE_STYLES[emotion]
        else:
            style = ("af", 1.0, 1.0) # Normal

        # Unpack style (Voice, Speed, Volume)
        if len(style) >= 2:
            voice_name = style[0]
            speed = style[1]
        if len(style) >= 3:
            volume = style[2]

        # 3. GENERATE
        samples, sample_rate = kokoro.create(text, voice=voice_name, speed=speed, lang="en-us")
        
        # 4. APPLY VOLUME
        if volume != 1.0:
            samples = samples * volume
            samples = np.clip(samples, -1.0, 1.0)

        sf.write(filepath, samples, sample_rate)
        return f"/static/audio/{filename}"
    except Exception as e: 
        print(f"   [Generation Error]: {e}")
        return None

def clean_for_speech(text):
    text = re.sub(r'\.{2,}', '... ', text)
    for word, replacement in PHONETIC_MAP.items():
        text = re.sub(r'\b' + re.escape(word) + r'\b', replacement, text, flags=re.IGNORECASE)
    return text

def check_mode_switch(text):
    global IS_QUIET_MODE
    text_lower = text.lower()
    
    # Enable Quiet Mode
    for trigger in QUIET_TRIGGERS:
        if trigger in text_lower:
            IS_QUIET_MODE = True
            print("🌙 Quiet Mode Activated")
            return True
            
    # Disable Quiet Mode
    for trigger in NORMAL_TRIGGERS:
        if trigger in text_lower:
            IS_QUIET_MODE = False
            print("☀️ Normal Mode Restored")
            return True
    return False

def process_response(user_text, my_start_time):
    global last_request_time
    if my_start_time < last_request_time: return

    # Check for mode commands
    check_mode_switch(user_text)

    print(f"\nUser: {user_text}")
    print(f"AI ({'Quiet' if IS_QUIET_MODE else 'Normal'}): ", end="", flush=True)

    if brain:
        buffer = ""
        current_emotion = "Neutral" 
        is_first_sentence = True
        
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
                    
                    # 1. DETECT EMOTION
                    for key, val in EMOTION_MAP.items():
                        if key in sentence.lower(): 
                            current_emotion = val
                            break 
                    
                    # 2. CLEAN TEXT
                    audio_text = re.sub(r'[\*\[].*?[\*\]]', '', sentence)
                    audio_text = re.sub(r'[^\w\s,.!?;:\'\-]', '', audio_text).strip()
                    if not any(c.isalnum() for c in audio_text): continue
                    audio_text = clean_for_speech(audio_text)

                    # 3. SOUND INJECTION
                    prefix = ""
                    
                    # A. FILLERS (Disable in quiet mode to save time/noise)
                    if is_first_sentence and not IS_QUIET_MODE:
                        if FILLERS and random.random() < 0.40: 
                            prefix = random.choice(FILLERS)
                        is_first_sentence = False
                    
                    # B. EMOTION SOUNDS (Disable loud sounds in Quiet Mode)
                    elif not IS_QUIET_MODE and current_emotion in SOUND_BANK and not prefix and random.random() < 0.50:
                        prefix = random.choice(SOUND_BANK[current_emotion])
                    
                    # C. BREATHS (Allowed in quiet mode, they fit well)
                    elif len(audio_text.split()) > 8 and not prefix and random.random() < 0.3:
                        if BREATH_SOUNDS: prefix = random.choice(BREATH_SOUNDS)

                    if prefix: audio_text = f"{prefix} ... {audio_text}"

                    # 4. GENERATE
                    filename = f"seq_{int(time.time())}_{len(playlist)}.wav"
                    audio_url = generate_kokoro_audio(audio_text, filename, emotion=current_emotion)
                    
                    if audio_url:
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
    print(f">> 🎤 [Server] Receiving Audio ({len(audio_data)} bytes)...")
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
            print(f"🎤 Heard: {text}")
            socketio.start_background_task(process_response, text, last_request_time)
        else:
            print("🎤 Heard Silence.")
            emit('error', {'message': "???"})
    except: pass

@socketio.on('interrupt_signal')
def handle_interrupt():
    global last_request_time
    last_request_time = time.time()
    print("--- INTERRUPT SIGNAL ---")

@socketio.on('delete_audio')
def handle_delete_audio(data):
    filename = data.get('filename')
    if filename:
        try: os.remove(os.path.join(audio_folder, os.path.basename(filename)))
        except: pass

if __name__ == '__main__':
    socketio.run(app, debug=True)