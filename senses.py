"""
FILE: senses.py
DESCRIPTION: 
    Audio Interface with "Patient Listening" tuning.
    - pause_threshold: Increased to 1.5s (allows pauses for thought).
    - phrase_time_limit: Removed (allows long sentences).
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
        
        self.recognizer.pause_threshold = 1.5 
        
        self.recognizer.energy_threshold = 300 
        self.recognizer.dynamic_energy_threshold = True
        
        self.text_queue = queue.Queue()
        self.audio_queue = queue.Queue()
        self.is_speaking = False
        
        try:
            self.kokoro = Kokoro("kokoro-v0_19.onnx", "voices.bin")
            print(f"[System] Kokoro Voice Model Loaded: {VOICE_NAME}")
        except Exception as e:
            print(f"[Error] Could not load Kokoro model: {e}")
            self.kokoro = None

        threading.Thread(target=self._synthesis_worker, daemon=True).start()
        threading.Thread(target=self._playback_worker, daemon=True).start()

    def _clean_text_for_speech(self, text):
        clean_text = re.sub(r'\*.*?\*', '', text)
        clean_text = emoji.replace_emoji(clean_text, replace='')
        return " ".join(clean_text.split())

    def _synthesis_worker(self):
        while True:
            text = self.text_queue.get()
            if text is None: break 
            try:
                samples, sample_rate = self.kokoro.create(
                    text, voice=VOICE_NAME, speed=1.1, lang="en-us"
                )
                silence = np.zeros(int(sample_rate * 0.3), dtype=np.float32)
                final_audio = np.concatenate((samples, silence))
                self.audio_queue.put((final_audio, sample_rate))
            except Exception as e:
                print(f"Synthesis Error: {e}")
            finally:
                self.text_queue.task_done()

    def _playback_worker(self):
        while True:
            audio_data = self.audio_queue.get()
            if audio_data is None: break
            samples, sample_rate = audio_data
            try:
                self.is_speaking = True
                sd.play(samples, sample_rate)
                sd.wait()
            except Exception as e:
                print(f"Playback Error: {e}")
            finally:
                self.is_speaking = False
                self.audio_queue.task_done()

    def speak(self, text):
        print(f"[Speaking]: {text}")
        spoken_text = self._clean_text_for_speech(text)
        if spoken_text.strip():
            self.text_queue.put(spoken_text)

    def listen(self):
        while self.is_speaking or not self.text_queue.empty() or not self.audio_queue.empty():
            time.sleep(0.1)

        with sr.Microphone() as source:
            self.recognizer.adjust_for_ambient_noise(source, duration=0.5)
            try:
                audio = self.recognizer.listen(source, timeout=5, phrase_time_limit=None)
                
                text = self.recognizer.recognize_google(audio)
                print(f"You said: {text}")
                return text
            except Exception:
                return None