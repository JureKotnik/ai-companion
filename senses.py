"""
FILE: senses.py
PROJECT: AI Companion
DESCRIPTION: 
    Audio interface with "Action Filtering".
    - Displays full text (including *actions*).
    - Speaks ONLY dialogue (removes *actions*).
    - Uses local Kokoro model with 'af_bella'.
"""

import speech_recognition as sr
import sounddevice as sd
import soundfile as sf
from kokoro_onnx import Kokoro
import re

VOICE_NAME = "af" 

class CompanionSenses:
    def __init__(self):
        self.recognizer = sr.Recognizer()
        
        try:
            self.kokoro = Kokoro("kokoro-v0_19.onnx", "voices.bin")
            print(f"[System] Kokoro Voice Model Loaded: {VOICE_NAME}")
        except Exception as e:
            print(f"[Error] Could not load Kokoro model: {e}")
            self.kokoro = None

    def _clean_text_for_speech(self, text):
        """Removes text between asterisks (* *) for audio only."""
        clean_text = re.sub(r'\*.*?\*', '', text)
        clean_text = " ".join(clean_text.split())
        return clean_text

    def speak(self, text):
        """Splits output: Prints full text, Speaks cleaned text."""
        if not self.kokoro:
            print(f"[Silent Mode]: {text}")
            return
        print(f"[Speaking]: {text}")
        spoken_text = self._clean_text_for_speech(text)
        if not spoken_text.strip():
            return

        try:
            samples, sample_rate = self.kokoro.create(
                spoken_text, 
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