"""
FILE: brain.py
PROJECT: AI Companion
DESCRIPTION: 
    This module interfaces with the local Llama model via Ollama. 
    It maintains a session-based memory so the AI understands 
    context during a conversation.

DEPENDENCIES:
    - ollama (Ensure you have run 'pip install ollama')
    - Llama 3.2 model (Ensure you have run 'ollama pull llama3.2')

LOGIC FLOW:
    1. Initialize the CompanionBrain class with a specific model.
    2. Store a list of 'messages' to act as short-term memory.
    3. Send the message list to Ollama and return the text response.
"""

import ollama

class CompanionBrain:
    def __init__(self, model_name="llama3.2"):
        self.model_name = model_name
        # This list stores the conversation context for the AI
        self.messages = [
            {"role": "system", "content": "You are a professional, helpful AI companion."}
        ]

    def get_response(self, user_input):
        # Add user's message to memory
        self.messages.append({"role": "user", "content": user_input})
        
        try:
            response = ollama.chat(model=self.model_name, messages=self.messages)
            ai_message = response['message']['content']
            
            # Add AI's response to memory
            self.messages.append({"role": "assistant", "content": ai_message})
            return ai_message
            
        except Exception as e:
            return f"Error: {e}. Make sure Ollama is running!"