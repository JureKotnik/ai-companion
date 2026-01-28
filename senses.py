"""
FILE: senses.py
DESCRIPTION: 
    Async Audio Interface.
    Uses a background thread (Worker) to process and play audio 
    so the main program never pauses.
"""

import speech_recognition as sr
import sounddevice as sd
import soundfile as sf
from kokoro_onnx import Kokoro
import re
import numpy as np
import emoji
import queue
import threading
import time

VOICE_NAME = "af"

class CompanionSenses:
    def __init__(self):
        self.recognizer = sr.Recognizer()
        
        self.audio_queue = queue.Queue()
        self.is_speaking = False
        
        try:
            self.kokoro = Kokoro("kokoro-v0_19.onnx", "voices.bin")
            print(f"[System] Kokoro Voice Model Loaded: {VOICE_NAME}")
        except Exception as e:
            print(f"[Error] Could not load Kokoro model: {e}")
            self.kokoro = None

        self.worker_thread = threading.Thread(target=self._audio_worker, daemon=True)
        self.worker_thread.start()

    def _clean_text_for_speech(self, text):
        clean_text = re.sub(r'\*.*?\*', '', text)
        clean_text = emoji.replace_emoji(clean_text, replace='')
        return " ".join(clean_text.split())

    def _audio_worker(self):
        """
        Runs in the background. 
        Constantly checks the queue for new text to speak.
        """
        while True:
            text = self.audio_queue.get()
            if text is None: break
            
            try:
                self.is_speaking = True
                
                samples, sample_rate = self.kokoro.create(
                    text, 
                    voice=VOICE_NAME, 
                    speed=1.2, 
                    lang="en-us"
                )
                
                silence = np.zeros(int(sample_rate * 0.5), dtype=np.float32)
                final_audio = np.concatenate((samples, silence))
                
                sd.play(final_audio, sample_rate)
                sd.wait()
                
            except Exception as e:
                print(f"Audio Error: {e}")
            finally:
                self.is_speaking = False
                self.audio_queue.task_done()

    def speak(self, text):
        """
        Non-blocking speak. 
        Just adds the text to the queue and returns immediately.
        """
        print(f"[Speaking]: {text}")
        
        spoken_text = self._clean_text_for_speech(text)
        if spoken_text.strip():
            self.audio_queue.put(spoken_text)

    def listen(self):
        while self.is_speaking or not self.audio_queue.empty():
            time.sleep(0.1)

        with sr.Microphone() as source:
            self.recognizer.adjust_for_ambient_noise(source, duration=0.5)
            try:
                audio = self.recognizer.listen(source, timeout=5, phrase_time_limit=10)
                text = self.recognizer.recognize_google(audio)
                print(f"You said: {text}")
                return text
            except Exception:
                return None