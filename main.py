"""
FILE: main.py
PROJECT: AI Companion
DESCRIPTION: 
    The terminal interface for the AI Companion. Orchestrates 
    the interaction between the user and the persistent brain module.

DEPENDENCIES:
    - brain.py

LOGIC FLOW:
    1. Start the companion.
    2. Retrieve AI responses (automatically saved to disk via brain.py).
    3. Handle the 'exit' command.
"""

from brain import CompanionBrain

def main():
    ai = CompanionBrain()
    
    print("--- AI Companion Online (Persistent Memory Active) ---")
    print("(Type 'exit' to quit)")

    while True:
        user_input = input("You: ")
        
        if user_input.lower() == "exit":
            print("Companion: Memory saved. Goodbye!")
            break
            
        response = ai.get_response(user_input)
        print(f"\nCompanion: {response}\n")

if __name__ == "__main__":
    main()