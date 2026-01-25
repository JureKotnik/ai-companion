"""
FILE: brain.py
PROJECT: AI Companion (Local Edition)
DESCRIPTION: 
    This module is the core intelligence engine. It utilizes Ollama to 
    run Llama 3.2 locally. It manages both volatile short-term memory 
    and persistent long-term memory via JSON. 

    It also securely loads custom system prompts from a hidden config file,
    ensuring personality settings are not exposed to version control.

DEPENDENCIES:
    - ollama
    - json
    - os
    - config (local hidden file)

LOGIC FLOW:
    1. Import Config: Attempts to load SYSTEM_PROMPT from config.py.
    2. Initialization: Loads historical data from memory.json or starts fresh.
    3. get_response: Orchestrates the message flow, appends to history, 
       triggers auto-save, and returns the AI's text.
    4. _save_memory: Atomic write operation to ensure data integrity.
"""

import ollama
import json
import os

try:
    from config import SYSTEM_PROMPT
except ImportError:
    SYSTEM_PROMPT = "You are a professional AI companion who remembers the user's details."

class CompanionBrain:
    def __init__(self, model_name="llama3.2", memory_file="memory.json"):
        self.model_name = model_name
        self.memory_file = memory_file
        self.messages = self._load_memory()

    def _load_memory(self):
        """Loads memory from a JSON file or returns a default system prompt."""
        if os.path.exists(self.memory_file):
            try:
                with open(self.memory_file, 'r') as f:
                    return json.load(f)
            except json.JSONDecodeError:
                return [{"role": "system", "content": SYSTEM_PROMPT}]
        
        return [{"role": "system", "content": SYSTEM_PROMPT}]

    def _save_memory(self):
        """Writes the current message list to a local JSON file."""
        with open(self.memory_file, 'w') as f:
            json.dump(self.messages, f, indent=4)

    def get_response(self, user_input):
        """
        Takes user input, appends it to history, generates a response 
        via Ollama, and saves the updated history to disk.
        """
        self.messages.append({"role": "user", "content": user_input})
        
        try:
            response = ollama.chat(model=self.model_name, messages=self.messages)
            ai_message = response['message']['content']
            self.messages.append({"role": "assistant", "content": ai_message})
            self._save_memory()     
            return ai_message
            
        except Exception as e:
            return f"Error: {str(e)}. Please check if the Ollama app is running."