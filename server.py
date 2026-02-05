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

audio_folder = os.path.join("static", "audio")
if os.path.exists(audio_folder):
    for f in os.listdir(audio_folder):
        if f.endswith(".wav"):
            try:
                os.remove(os.path.join(audio_folder, f))
            except Exception as e:
                print(f"Could not delete old file {f}: {e}")
else:
    os.makedirs(audio_folder)

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
    stt_model = whisper.load_model("tiny.en")
    print("✔ Whisper STT Loaded.")
except Exception as e:
    stt_model = None
    print(f"❌ Error loading Whisper: {e}")

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
    print(f"\nUser: {user_text}")
    print("AI: ", end="", flush=True) # Prepare terminal for typing

    # 1. Define Emotions Map
    emotion_map = {
        "happy": "Happy", "smile": "Happy", "smiling": "Smiling",
        "sad": "Sad", "cry": "Cry", "tear": "Cry", "depressed": "Sad",
        "angry": "Angry", "mad": "Angry", "furious": "Angry",
        "wink": "Wink", "flirt": "Wink",
        "love": "Love", "blush": "Love", "shy": "Embarrassed",
        "nervous": "Nervous", "scared": "Scared", "afraid": "Scared",
        "sleepy": "Sleepy", "tired": "Sleepy", "yawn": "Sleepy",
        "amazed": "Amazed", "wow": "Amazed", "surprised": "Surprised",
        "confused": "Confused", "huh": "Confused", "what": "Confused",
        "thinking": "Thinking", "hmm": "Thinking",
        "laugh": "Laughing", "haha": "Laughing", "lol": "Laughing",
        "bored": "Bored", "determined": "Determined", "serious": "Determined",
        "disgusted": "Disgusted", "eww": "Disgusted", "gross": "Disgusted",
        "disappointed": "Disappointed", "sigh": "Disappointed"
    }

    if brain:
        buffer = ""
        current_emotion = None # Hold emotion until we speak

        # 2. Stream the response chunk by chunk
        for chunk in brain.stream_response(user_text):
            buffer += chunk
            sys.stdout.write(chunk) # Type to terminal immediately
            sys.stdout.flush()
            
            # 3. If we hit a punctuation mark, process the sentence
            if re.search(r'[.!?;:]', chunk):
                # Split buffer into sentences (keeping punctuation)
                parts = re.split(r'([.!?;:])', buffer)
                buffer = "" # Clear buffer for next sentence
                
                # Re-assemble (e.g., "Hello" + "!")
                sentences = ["".join(x) for x in zip(parts[0::2], parts[1::2])]
                
                playlist = []
                
                for sentence in sentences:
                    sentence = sentence.strip()
                    if not sentence: continue

                    # --- A. EXTRACT EMOTION ---
                    # Look for [Tag] or *Action*
                    tag_match = re.search(r'[\*\[](.*?)[\*\]]', sentence)
                    
                    if tag_match:
                        raw_tag = tag_match.group(1).lower() # e.g. "smiling slightly"
                        
                        # Find matching emotion in our map
                        found_emo = False
                        for key, val in emotion_map.items():
                            if key in raw_tag:
                                current_emotion = val
                                found_emo = True
                                print(f"\n[Expression Set: {current_emotion}]")
                                break
                        
                        if not found_emo:
                            current_emotion = "Reset"

                    # --- B. OPEN APPS ---
                    if "[[OPEN:" in sentence:
                        print(f"\n[Command: {sentence}]")
                        continue

                    # --- C. CLEAN TEXT FOR AUDIO (Crucial for "Noises") ---
                    # 1. Remove [Tags] and *Actions* completely
                    audio_text = re.sub(r'[\*\[].*?[\*\]]', '', sentence)
                    # 2. Remove emojis and weird symbols
                    audio_text = re.sub(r'[^\w\s,.!?;:\']', '', audio_text)
                    audio_text = re.sub(r'\bIT\b', 'it', audio_text)
                    audio_text = re.sub(r'\bAM\b', 'am', audio_text)
                    audio_text = audio_text.strip()

                    # 3. SAFETY CHECK: If text is just "." or empty, SKIP IT
                    # This prevents the "Random Noise" glitch
                    if not any(c.isalnum() for c in audio_text):
                        continue 

                    # --- D. GENERATE AUDIO ---
                    filename = f"seq_{int(time.time())}_{len(playlist)}.wav"
                    filepath = os.path.join(audio_folder, filename)
                    audio_url = None

                    if kokoro:
                        try:
                            samples, sample_rate = kokoro.create(
                                audio_text, 
                                voice="af", 
                                speed=1.0, 
                                lang="en-us"
                            )
                            sf.write(filepath, samples, sample_rate)
                            audio_url = f"/static/audio/{filename}"
                        except Exception as e:
                            print(f"\nAudio Error: {e}")

                    # Add to playlist
                    playlist.append({
                        'text': sentence, # Send original text to screen (so we see tags)
                        'audio': audio_url,
                        'emotion': current_emotion
                    })

                # Emit batch immediately
                if playlist:
                    socketio.emit('speak_audio_sequence', playlist, namespace='/')
        
        print("")

@socketio.on('delete_audio')
def handle_delete_audio(data):
    filename_url = data.get('filename')
    if not filename_url:
        return

    # Security: Extract just the filename to prevent hacking (e.g., "../server.py")
    clean_name = os.path.basename(filename_url) 
    file_path = os.path.join(audio_folder, clean_name)

    if os.path.exists(file_path):
        try:
            os.remove(file_path)
            # print(f"🗑 Cleaned up: {clean_name}") # Uncomment to see it happen
        except Exception as e:
            print(f"Error deleting file: {e}")

@socketio.on('user_message')
def handle_message(data):
    user_text = data.get('message')
    socketio.start_background_task(process_response, user_text)

@socketio.on('audio_stream')
def handle_audio_stream(audio_data):
    if not stt_model:
        emit('error', {'message': "Whisper is not loaded on server."})
        return

    try:
        # 1. Save the audio data to a TEMPORARY file on your hard drive
        # Whisper requires a real file path to run ffmpeg on it.
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as temp_audio:
            temp_audio.write(audio_data)
            temp_path = temp_audio.name # This gets the real path (e.g. C:\Users\Temp\tmp123.webm)
        
        print(f"🎤 Processing audio file: {temp_path}")

        # 2. Transcribe the REAL file
        # fp16=False prevents warnings on CPU
        result = stt_model.transcribe(temp_path, fp16=False) 
        text = result['text'].strip()
        
        # 3. Delete the file (Clean up)
        os.remove(temp_path)
        
        if text:
            print(f"🎤 Heard: {text}")
            # Send the text to the brain
            socketio.start_background_task(process_response, text)
        else:
            emit('error', {'message': "Could not understand audio."})

    except Exception as e:
        print(f"❌ STT Error: {e}")
        # Clean up if something broke
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.remove(temp_path)

if __name__ == '__main__':
    print("--- SERVER ONLINE ---")
    socketio.run(app, debug=True)