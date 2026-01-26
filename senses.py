"""
FILE: senses.py
PROJECT: AI Companion (Local Edition)
DESCRIPTION: 
    Handles the Input/Output sensory interfaces for the AI.
    - Ears: Listens to microphone input and converts to text (STT).
    - Mouth: Converts text responses into audible speech (TTS).

DEPENDENCIES:
    - speech_recognition
    - pyttsx3
    - pyaudio

LOGIC FLOW:
    - listen(): Activates microphone, adjusts for ambient noise, returns string.
    - speak(text): Takes a string and reads it aloud using the system engine.
"""

import speech_recognition as sr
import pyttsx3

class CompanionSenses:
    def __init__(self):
        self.engine = pyttsx3.init()
        voices = self.engine.getProperty('voices')
        self.engine.setProperty('voice', voices[0].id) 
        self.engine.setProperty('rate', 170)

        self.recognizer = sr.Recognizer()

    def speak(self, text):
        """Converting text to speech."""
        print(f"[Speaking]: {text}")
        self.engine.say(text)
        self.engine.runAndWait()

    def listen(self):
        """Listens to the microphone and returns the text."""
        with sr.Microphone() as source:
            print("\n(Listening... speak now)")
            
            self.recognizer.adjust_for_ambient_noise(source, duration=0.5)
            
            try:
                audio = self.recognizer.listen(source, timeout=5, phrase_time_limit=10)
                print("(Thinking...)")
                text = self.recognizer.recognize_google(audio)
                print(f"You said: {text}")
                return text
                
            except sr.WaitTimeoutError:
                return None
            except sr.UnknownValueError:
                print("Companion: I didn't catch that.")
                return None
            except sr.RequestError:
                print("Companion: Connection error with speech service.")
                return None