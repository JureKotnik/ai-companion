"""
FILE: main.py
DESCRIPTION: 
    Main entry point with 3D Avatar Integration.
    - Connects Brain (Llama), Ears (Senses), and Body (VTube Studio).
"""

from brain import CompanionBrain
from senses import CompanionSenses
from body import CompanionBody
import time
import sys

try:
    from config import WAKE_WORD, ALWAYS_LISTEN
except ImportError:
    WAKE_WORD = "astra"
    ALWAYS_LISTEN = True

CONVERSATION_TIMEOUT = 30 

def main():
    print("--- STARTING SYSTEMS ---")
    ai = CompanionBrain()
    senses = CompanionSenses()
    body = CompanionBody()
    
    is_awake = False
    last_interaction_time = 0

    print(f"--- AI Companion Online ({WAKE_WORD.upper()}) ---")
    print(f"Mode: {'HANDS-FREE' if ALWAYS_LISTEN else 'MANUAL'}")

    while True:
        user_prompt = None
        current_time = time.time()

        is_busy = (
            senses.is_speaking or 
            not senses.text_queue.empty() or 
            not senses.audio_queue.empty()
        )
        
        if is_busy:
            last_interaction_time = current_time

        if is_awake and not is_busy and (current_time - last_interaction_time > CONVERSATION_TIMEOUT):
            print("\n[Timeout] Going to sleep.")
            is_awake = False
            body.set_mood("reset") 

        text = senses.listen()
        current_time = time.time()
        
        if not text:
            continue 

        lower_text = text.lower()

        if not is_awake:
            if WAKE_WORD in lower_text:
                print(f"[Waking Up!]")
                is_awake = True
                last_interaction_time = current_time
                user_prompt = lower_text.replace(WAKE_WORD, "").strip()
                
                body.set_mood("happy") 
                
                if not user_prompt:
                    senses.speak("Yes?")
                    continue 
            else:
                pass 

        else:
            if "go to sleep" in lower_text:
                senses.speak("Standing by.")
                body.set_mood("reset")
                is_awake = False
                continue
            
            last_interaction_time = current_time
            user_prompt = text

        if user_prompt:
            print("Companion: ", end="", flush=True)
            
            body.set_mood(user_prompt)

            buffer = ""
            for chunk in ai.stream_response(user_prompt):
                buffer += chunk
                print(chunk, end="", flush=True) 
                
                if any(punct in chunk for punct in ".?!"):
                    if len(buffer.strip()) > 10: 
                        senses.speak(buffer) 
                        
                        body.set_mood(buffer)
                        
                        buffer = "" 
            if buffer.strip():
                senses.speak(buffer)
                body.set_mood(buffer)
            
            print() 

if __name__ == "__main__":
    main()