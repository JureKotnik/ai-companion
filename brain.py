"""
FILE: brain.py
PROJECT: AI Companion
DESCRIPTION: 
    This module manages the local Llama brain and persistent memory.
    It uses a JSON file to store chat history, allowing the companion 
    to retain information across system restarts.

DEPENDENCIES:
    - ollama
    - json
    - os

LOGIC FLOW:
    1. Initialize: Check if 'memory.json' exists.
    2. Load: Import existing messages if the file is found.
    3. Process: Send context-aware messages to Llama.
    4. Save: Write the updated history back to JSON after every response.
"""

import ollama
import json
import os

class CompanionBrain:
    def __init__(self, model_name="llama3.2", memory_file="memory.json"):
        self.model_name = model_name
        self.memory_file = memory_file
        # Initialize memory by loading from file or starting fresh
        self.messages = self._load_memory()

    def _load_memory(self):
        """Loads memory from a JSON file or returns a default system prompt."""
        if os.path.exists(self.memory_file):
            with open(self.memory_file, 'r') as f:
                return json.load(f)
        
        # Default starting state
        return [{"role": "system", "content": "You are a professional AI companion who remembers the user's details."}]

    def _save_memory(self):
        """Writes the current message list to a local JSON file."""
        with open(self.memory_file, 'w') as f:
            json.dump(self.messages, f, indent=4)

    def get_response(self, user_input):
        self.messages.append({"role": "user", "content": user_input})
        
        try:
            response = ollama.chat(model=self.model_name, messages=self.messages)
            ai_message = response['message']['content']
            
            self.messages.append({"role": "assistant", "content": ai_message})
            
            # Persistent Save
            self._save_memory()
            
            return ai_message
        except Exception as e:
            return f"Error: {e}. Check if Ollama is running."