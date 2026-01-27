"""
FILE: senses.py
PROJECT: AI Companion
DESCRIPTION: 
    Audio interface with "Silence Padding" and "Emoji Filtering".
    - Displays: Full text with emojis and actions.
    - Speaks: Clean text (no actions, no emojis).
"""

import speech_recognition as sr
import sounddevice as sd
import soundfile as sf
from kokoro_onnx import Kokoro
import re
import numpy as np
import emoji 

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
        """
        Prepares text for TTS:
        1. Removes *actions* (e.g. *waves*)
        2. Removes emojis (e.g. 😊)
        """
        clean_text = re.sub(r'\*.*?\*', '', text)
        clean_text = emoji.replace_emoji(clean_text, replace='')
        return " ".join(clean_text.split())

    def speak(self, text):
        """Generates audio, adds padding, and plays."""
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
            silence_duration = 0.5
            silence_samples = int(sample_rate * silence_duration)
            silence = np.zeros(silence_samples, dtype=np.float32)
            
            final_audio = np.concatenate((samples, silence))

            sd.play(final_audio, sample_rate)
            sd.wait()
            
        except Exception as e:
            print(f"Audio Generation Error: {e}")

    def listen(self):
        with sr.Microphone() as source:
            self.recognizer.adjust_for_ambient_noise(source, duration=0.5)
            try:
                audio = self.recognizer.listen(source, timeout=5)
                text = self.recognizer.recognize_google(audio)
                print(f"You said: {text}")
                return text
            except Exception:
                return None