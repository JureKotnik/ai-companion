"""
FILE: main.py
DESCRIPTION: 
    Main entry point with Threaded Audio & Streaming.
    - Fixes 'IndentationError'
    - Fixes 'Choppy Audio' by buffering full sentences.
"""

from brain import CompanionBrain
from senses import CompanionSenses
import time
import sys

try:
    from config import WAKE_WORD, ALWAYS_LISTEN
except ImportError:
    WAKE_WORD = "astra"
    ALWAYS_LISTEN = True

CONVERSATION_TIMEOUT = 30 

def main():
    ai = CompanionBrain()
    senses = CompanionSenses()
    
    is_awake = False
    last_interaction_time = 0

    print(f"--- AI Companion Online ({WAKE_WORD.upper()}) ---")
    print(f"Mode: {'HANDS-FREE' if ALWAYS_LISTEN else 'MANUAL'}")

    while True:
        user_prompt = None
        
        text = senses.listen()
        current_time = time.time()
        
        if is_awake and (current_time - last_interaction_time > CONVERSATION_TIMEOUT):
            print("\n[Timeout] Going to sleep.")
            is_awake = False

        if not text:
            continue 

        lower_text = text.lower()

        if not is_awake:
            if WAKE_WORD in lower_text:
                print(f"[Waking Up!]")
                is_awake = True
                last_interaction_time = current_time
                
                user_prompt = lower_text.replace(WAKE_WORD, "").strip()
                
                if not user_prompt:
                    senses.speak("Yes?")
                    continue 
            else:
                pass 

        else:
            if "go to sleep" in lower_text:
                senses.speak("Standing by.")
                is_awake = False
                continue
            
            last_interaction_time = current_time
            user_prompt = text

        if user_prompt:
            print("Companion: ", end="", flush=True)
            
            buffer = ""
            for chunk in ai.stream_response(user_prompt):
                buffer += chunk
                print(chunk, end="", flush=True) 
                if any(punct in chunk for punct in ".?!"):
                    if len(buffer.strip()) > 10: 
                        senses.speak(buffer) 
                        buffer = "" 
            if buffer.strip():
                senses.speak(buffer)
            
            print()

if __name__ == "__main__":
    main()