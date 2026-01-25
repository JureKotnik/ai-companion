"""
FILE: main.py
PROJECT: AI Companion
DESCRIPTION: 
    The entry point for the application. This file handles the 
    terminal interface and coordinates the communication flow 
    between the user and the CompanionBrain.

DEPENDENCIES:
    - brain.py (local module)

LOGIC FLOW:
    1. Instantiate the CompanionBrain.
    2. Enter a loop to receive user commands.
    3. Relay user input to the brain and display the response.
    4. Provide a clean exit mechanism.
"""

from brain import CompanionBrain

def main():
    ai = CompanionBrain()
    
    print("--- AI Companion Initialized ---")
    print("(Type 'exit' to stop the session)")

    while True:
        user_input = input("You: ")
        
        if user_input.lower() == "exit":
            print("Companion: Ending session. Goodbye.")
            break
            
        response = ai.get_response(user_input)
        print(f"Companion: {response}\n")

if __name__ == "__main__":
    main()