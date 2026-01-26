"""
FILE: senses.py
PROJECT: AI Companion
DESCRIPTION: 
    Audio interface using the local 'Kokoro-82M' model.
    This provides high-quality, authentic anime-style voices 
    running 100% offline on your machine.
"""

import speech_recognition as sr
import sounddevice as sd
import soundfile as sf
from kokoro_onnx import Kokoro
import numpy as np

# Voice Options:
# "af_heart"  -> The most popular 'Anime Girl' voice (Soft, Breath, Cute)
# "af_bella"  -> Higher pitched, energetic
# "af_nicole" -> Whispery, calm
# "am_michael"-> Male, calm
VOICE_NAME = "af" 

class CompanionSenses:
    def __init__(self):
        self.recognizer = sr.Recognizer()
        
        try:
            self.kokoro = Kokoro("kokoro-v0_19.onnx", "voices.bin")
            print(f"[System] Kokoro Voice Model Loaded: {VOICE_NAME}")
        except Exception as e:
            print(f"[Error] Could not load Kokoro model: {e}")
            print("Did you download 'kokoro-v0_19.onnx' and 'voices.bin'?")
            self.kokoro = None

    def speak(self, text):
        """Generates audio using Kokoro and plays it locally."""
        if not self.kokoro:
            print(f"[Silent Mode]: {text}")
            return

        print(f"[Speaking]: {text}")
        
        try:
            samples, sample_rate = self.kokoro.create(
                text, 
                voice=VOICE_NAME, 
                speed=1.1, 
                lang="en-us"
            )
            
            sd.play(samples, sample_rate)
            sd.wait()
            
        except Exception as e:
            print(f"Audio Generation Error: {e}")

    def listen(self):
        with sr.Microphone() as source:
            print("\n(Listening... speak now)")
            self.recognizer.adjust_for_ambient_noise(source, duration=0.5)
            try:
                audio = self.recognizer.listen(source, timeout=5)
                print("(Thinking...)")
                text = self.recognizer.recognize_google(audio)
                print(f"You said: {text}")
                return text
            except Exception:
                return None