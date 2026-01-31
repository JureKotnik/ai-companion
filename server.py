"""
FILE: server.py
DESCRIPTION: Flask Server with working EXIT command.
"""
from flask import Flask, render_template
from flask_socketio import SocketIO
import threading, time, os, sys
from brain import CompanionBrain
from senses import CompanionSenses

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# --- SILENCE THE FAVICON ERROR ---
@app.route('/favicon.ico')
def favicon():
    return "", 204

class WebSenses(CompanionSenses):
    def speak(self, text):
        print(f"[AI]: {text}")
        spoken_text = self._clean_text_for_speech(text)
        if not spoken_text.strip(): return

        filename = f"speech_{int(time.time()*1000)}.wav"
        filepath = os.path.join("static", "audio", filename)
        
        try:
            samples, sample_rate = self.kokoro.create(spoken_text, voice="af", speed=1.1, lang="en-us")
            import soundfile as sf
            sf.write(filepath, samples, sample_rate)
            socketio.emit('speak_audio', {'url': f"/static/audio/{filename}"})
            time.sleep(len(samples) / sample_rate)
        except Exception as e:
            print(f"Audio Error: {e}")

def ai_loop():
    print("--- AI Brain Starting ---")
    ai = CompanionBrain()
    senses = WebSenses()
    
    time.sleep(1)
    
    while True:
        try:
            # 1. GET INPUT
            user_input = input("\nYou (Type here): ")

            # 2. EMERGENCY EXIT - CHECK THIS FIRST
            if user_input.strip().lower() in ['exit', 'quit', 'stop']:
                print(">>> SHUTTING DOWN SYSTEM...")
                os._exit(0) # Force kills python immediately

            # 3. AI PROCESSING
            if user_input:
                if "happy" in user_input.lower(): socketio.emit('set_expression', {'mood': 'happy'})
                elif "angry" in user_input.lower(): socketio.emit('set_expression', {'mood': 'angry'})
                else: socketio.emit('set_expression', {'mood': 'reset'})

                response_buffer = ""
                for chunk in ai.stream_response(user_input):
                    response_buffer += chunk
                    if any(p in chunk for p in ".?!"):
                         if len(response_buffer) > 5:
                            senses.speak(response_buffer)
                            response_buffer = ""
                if response_buffer: senses.speak(response_buffer)
                
        except Exception as e:
            print(f"Error: {e}")

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    threading.Thread(target=ai_loop, daemon=True).start()
    print("GO TO: http://127.0.0.1:5000")
    # allow_unsafe_werkzeug allows us to kill the thread easily
    socketio.run(app, port=5000, debug=False, allow_unsafe_werkzeug=True)