"""
FILE: main.py
PROJECT: AI Companion (Local Edition)
DESCRIPTION: 
    Main entry point with "Hands-Free" Wake Word detection.
    
    LOGIC:
    1. Loop continuously.
    2. Listen to audio.
    3. If text starts with WAKE_WORD ("Astra..."), process it.
    4. Otherwise, ignore and listen again.
"""

from brain import CompanionBrain
from senses import CompanionSenses
import sys

try:
    from config import WAKE_WORD, ALWAYS_LISTEN
except ImportError:
    WAKE_WORD = "astra"
    ALWAYS_LISTEN = False

def main():
    ai = CompanionBrain()
    senses = CompanionSenses()
    
    print(f"--- AI Companion Online ({WAKE_WORD.upper()}) ---")
    print(f"Mode: {'HANDS-FREE' if ALWAYS_LISTEN else 'MANUAL (Press Enter)'}")
    print("---------------------------------------")

    while True:
        user_input = ""
        if ALWAYS_LISTEN:
            audio_text = senses.listen()
            
            if audio_text:
                lower_text = audio_text.lower()
                
                if WAKE_WORD in lower_text:
                    print(f"[Wake Word Detected]: '{lower_text}'")
                    cleaned_input = lower_text.replace(WAKE_WORD, "").strip()
                    
                    if not cleaned_input:
                        cleaned_input = "Hello?"
                        
                    user_input = cleaned_input
                else:
                    print(f"(Ignoring: '{audio_text}')")
                    continue
            else:
                continue
        else:
            try:
                user_input = input(f"\nYou ({WAKE_WORD}): ")
                if user_input.strip() == "":
                    voice_text = senses.listen()
                    if voice_text:
                        user_input = voice_text
                    else:
                        continue
            except KeyboardInterrupt:
                print("\nShutting down.")
                break
        if user_input.lower() in ["exit", "quit", "stop"]:
            senses.speak("Goodbye.")
            break
        if user_input:
            response = ai.get_response(user_input)
            print(f"Companion: {response}")
            senses.speak(response)

if __name__ == "__main__":
    main()