"""
FILE: main.py
PROJECT: AI Companion
DESCRIPTION: 
    Advanced 'Conversation Mode'.
    - Listens for Wake Word to activate.
    - Stays active for a set timeout (e.g., 30s) for fluid conversation.
    - Auto-sleeps after silence.
"""

from brain import CompanionBrain
from senses import CompanionSenses
import time

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
        text = senses.listen()   
        current_time = time.time() 
        if is_awake and (current_time - last_interaction_time > CONVERSATION_TIMEOUT):
            print("\n[Timeout] Conversation ended. Going back to sleep.")
            senses.speak("I'll be here if you need me.") 
            is_awake = False

        if not text:
            continue

        lower_text = text.lower()
        if not is_awake:
            if WAKE_WORD in lower_text:
                print(f"[Waking Up!]")
                is_awake = True
                last_interaction_time = current_time
                clean_input = lower_text.replace(WAKE_WORD, "").strip()
                if not clean_input:
                    senses.speak("Yes?")
                    continue
                response = ai.get_response(clean_input)
                print(f"Companion: {response}")
                senses.speak(response)
            else:
                print(f"(Ignored: {text})")
        else:
            if "go to sleep" in lower_text or "stop listening" in lower_text:
                senses.speak("Standing by.")
                is_awake = False
                continue
            last_interaction_time = current_time
            response = ai.get_response(text)
            print(f"Companion: {response}")
            senses.speak(response)

if __name__ == "__main__":
    main()