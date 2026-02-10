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
import threading 
import vision_server

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
IS_QUIET_MODE = False
IS_SCREEN_SHARING = False  
last_request_time = 0   # Handles user interruptions
last_interaction_time = time.time() # Tracks silence duration
is_speaking = False     # Prevents her from interrupting herself
autonomy_enabled = True # Master switch for spontaneous talking

# --- LOAD MODELS ---
try: kokoro = Kokoro("kokoro-v0_19.onnx", "voices.bin"); print("✔ Kokoro Loaded.")
except: kokoro = None
try: stt_model = whisper.load_model("tiny.en"); print("✔ Whisper Loaded.")
except: stt_model = None
try: brain = CompanionBrain(model_name="llama3.1"); print("✔ Brain Loaded.")
except: brain = None

if TEST_MODE:
    print("\n⚠️  WARNING: TEST MODE IS ON. Memory will not be saved. ⚠️\n")

@app.route('/')
def index(): return render_template('live2d.html')

@app.route('/favicon.ico')
def favicon(): return "", 204

# ==========================================
# 🧠 ADVANCED SPONTANEITY ENGINE
# ==========================================
def autonomy_loop():
    global last_interaction_time, is_speaking
    print("🧠 Spontaneity Engine Started...")
    
    # Initialize the first "Next Trigger Time"
    # Wait at least 45 seconds after startup before talking
    next_trigger_time = time.time() + random.randint(45, 120)

    while True:
        time.sleep(1) # Check every second (low CPU usage)
        
        current_time = time.time()
        
        # 1. STOP CONDITIONS
        # If disabled, quiet mode, or she's already talking -> Do nothing
        if not autonomy_enabled or is_speaking or IS_QUIET_MODE or IS_SCREEN_SHARING:
            # Push the trigger time forward so she doesn't speak *immediately* after finishing
            if is_speaking:
                next_trigger_time = current_time + random.randint(30, 90)
            continue
            
        # 2. SILENCE CHECK
        # If the user spoke recently (e.g. 10s ago), delay the trigger
        if (current_time - last_interaction_time) < 15:
            next_trigger_time = current_time + random.randint(30, 60)
            continue

        # 3. TRIGGER TIME REACHED?
        if current_time > next_trigger_time:
            # ROLL THE DICE
            # 20% Chance for a LONG RAMBLE
            # 80% Chance for a SHORT COMMENT
            if random.random() < 0.20:
                trigger_random_thought(ramble=True)
                # Rambles need a longer cooldown (3 to 6 minutes)
                next_trigger_time = current_time + random.randint(180, 360)
            else:
                trigger_random_thought(ramble=False)
                # Short comments need a shorter cooldown (1 to 3 minutes)
                next_trigger_time = current_time + random.randint(60, 180)

def trigger_random_thought(ramble=False):
    global is_speaking, last_request_time
    
    # Update timestamps to prevent conflicts
    my_start_time = time.time()
    last_request_time = my_start_time
    
    prompt = ""
    
    if ramble:
        print("💡 She decided to RAMBLE!")
        ramble_topics = [
            "the nature of consciousness and being an AI",
            "a weird dream you 'had' (hallucinate one)",
            "why humans are so obsessed with time",
            "a detailed story about a fictional place",
            "your favorite colors and why they make you feel things",
            "the concept of infinite space"
        ]
        topic = random.choice(ramble_topics)
        # We explicitly tell the Brain to go long
        prompt = f"(The room is silent. You feel like rambling. Start talking about {topic}. Go on a tangent. Connect it to random things. Speak for a while, at least 3-4 sentences. Be stream-of-consciousness.)"
    else:
        print("💡 She decided to make a short comment.")
        flavors = [
            "Share a random fun fact.",
            "Ask the user what they are thinking about.",
            "Hum or make a sound effect (write *humming*).",
            "Comment on how peaceful it is.",
            "Remember something we talked about earlier."
        ]
        flavor = random.choice(flavors)
        prompt = f"(The room is silent. {flavor} Keep it brief and conversational.)"
    
    # Run in background
    socketio.start_background_task(process_response, prompt, my_start_time)

# ==========================================
# 🔊 AUDIO & TEXT PROCESSING
# ==========================================

def generate_kokoro_audio(text, filename, emotion=None):
    if not kokoro: return None
    try:
        filepath = os.path.join(audio_folder, filename)
        
        # DEFAULTS
        voice_name = "af" 
        speed = 1.0       
        volume = 1.0      

        if IS_QUIET_MODE:
            if "Whisper" in VOICE_STYLES: style = VOICE_STYLES["Whisper"]
            else: style = ("af", 0.95, 0.3) 
        elif emotion in VOICE_STYLES:
            style = VOICE_STYLES[emotion]
        else:
            style = ("af", 1.0, 1.0) 

        if len(style) >= 2: voice_name, speed = style[0], style[1]
        if len(style) >= 3: volume = style[2]

        samples, sample_rate = kokoro.create(text, voice=voice_name, speed=speed, lang="en-us")
        
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
    for trigger in QUIET_TRIGGERS:
        if trigger in text_lower:
            IS_QUIET_MODE = True; print("🌙 Quiet Mode Activated"); return True
    for trigger in NORMAL_TRIGGERS:
        if trigger in text_lower:
            IS_QUIET_MODE = False; print("☀️ Normal Mode Restored"); return True
    return False

def process_response(user_text, my_start_time):
    global last_request_time, is_speaking, last_interaction_time
    if my_start_time < last_request_time: return

    is_speaking = True
    last_interaction_time = time.time()
    check_mode_switch(user_text)

    print(f"\nUser: {user_text}")
    print(f"AI ({'Quiet' if IS_QUIET_MODE else 'Normal'}): ", end="", flush=True)

    if brain:
        buffer = ""
        current_emotion = "Neutral" 
        is_first_sentence = True
        
        try:
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
                        
                        for key, val in EMOTION_MAP.items():
                            if key in sentence.lower(): current_emotion = val; break 
                        
                        audio_text = re.sub(r'[\*\[].*?[\*\]]', '', sentence)
                        audio_text = re.sub(r'[^\w\s,.!?;:\'\-]', '', audio_text).strip()
                        if not any(c.isalnum() for c in audio_text): continue
                        audio_text = clean_for_speech(audio_text)

                        prefix = ""
                        if is_first_sentence and not IS_QUIET_MODE:
                            if FILLERS and random.random() < 0.40: prefix = random.choice(FILLERS)
                            is_first_sentence = False
                        elif not IS_QUIET_MODE and current_emotion in SOUND_BANK and not prefix and random.random() < 0.50:
                            prefix = random.choice(SOUND_BANK[current_emotion])
                        elif len(audio_text.split()) > 8 and not prefix and random.random() < 0.3:
                            if BREATH_SOUNDS: prefix = random.choice(BREATH_SOUNDS)

                        if prefix: audio_text = f"{prefix} ... {audio_text}"

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
                
        finally:
            is_speaking = False
            last_interaction_time = time.time()

# ==========================================
# 🔌 SOCKET HANDLERS
# ==========================================

@socketio.on('user_message')
def handle_message(data):
    global last_request_time, last_interaction_time
    last_interaction_time = time.time()
    last_request_time = time.time()
    socketio.start_background_task(process_response, data.get('message'), last_request_time)

@socketio.on('audio_stream')
def handle_audio_stream(audio_data):
    print(f">> 🎤 [Server] Receiving Audio ({len(audio_data)} bytes)...")
    global last_request_time, last_interaction_time
    last_request_time = time.time() 
    last_interaction_time = time.time() 
    
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

# ==========================================
# 🖥️ SCREEN VISION HANDLER
# ==========================================
@socketio.on('screen_update')
def handle_screen_update(data):
    global last_request_time, is_speaking
    
    # 1. Don't interrupt if she's already talking or user is talking
    if is_speaking or (time.time() - last_request_time < 5):
        return

    image_data = data.get('image')
    if not image_data: return

    # Update timestamps to lock resources
    my_start_time = time.time()
    last_request_time = my_start_time
    
    # Run vision analysis in background
    socketio.start_background_task(process_vision, image_data, my_start_time)

def process_vision(image_data, my_start_time):
    global is_speaking, last_request_time, last_interaction_time
    
    # Call the separate vision handler
    reaction = vision_server.analyze_screen(image_data, brain)
    
    if reaction:
        # Send reaction to the standard processing function 
        # (This reuses your existing TTS and emotion logic)
        process_response(reaction, my_start_time)

@socketio.on('start_screen_share')
def handle_screen_start():
    global IS_SCREEN_SHARING
    IS_SCREEN_SHARING = True
    print("🖥️ Screen Sharing Started (Autonomy Disabled)")

@socketio.on('stop_screen_share')
def handle_screen_stop():
    global IS_SCREEN_SHARING
    IS_SCREEN_SHARING = False
    print("🖥️ Screen Sharing Stopped (Autonomy Re-enabled)")

if __name__ == '__main__':
    # Start the Autonomy Loop in the background
    threading.Thread(target=autonomy_loop, daemon=True).start()
    socketio.run(app, debug=True)