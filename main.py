"""
FILE: main.py
PROJECT: AI Companion (Local Edition)
DESCRIPTION: 
    Main entry point. Updated to support Voice Interaction via senses.py.
    The user can now communicate hands-free.

DEPENDENCIES: brain.py, senses.py
"""

from brain import CompanionBrain
from senses import CompanionSenses

def main():
    ai = CompanionBrain()
    senses = CompanionSenses()
    
    print("--- AI Companion Online ---")
    print("Modes: Type normally OR press 'Enter' (empty) to trigger Voice Mode.")
    print("(Type 'exit' to quit)")

    while True:
        user_input = input("\nYou (Press Enter to Speak): ")
        
        if user_input.lower() in ["exit", "quit"]:
            senses.speak("Goodbye, sir.")
            break
        
        if user_input.strip() == "":
            voice_text = senses.listen()
            if voice_text:
                user_input = voice_text
            else:
                continue 

        response = ai.get_response(user_input)
        print(f"Companion: {response}")
        senses.speak(response)

if __name__ == "__main__":
    main()