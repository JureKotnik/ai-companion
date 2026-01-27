"""
FILE: brain.py
PROJECT: AI Companion
DESCRIPTION: Core intelligence engine with Memory, Vision, and Tools.
"""

import ollama
import json
import os
import re
from skills import extract_and_read_file, open_application

TOOL_INSTRUCTIONS = """
You can open applications on the user's PC.
To open an app, output ONLY this tag: [[OPEN: app_name]]
Example: To open Notepad, write [[OPEN: notepad]].
Do not ask for permission, just do it.
"""

try:
    from config import SYSTEM_PROMPT
except ImportError:
    SYSTEM_PROMPT = "You are a professional AI companion."

FULL_SYSTEM_PROMPT = SYSTEM_PROMPT + "\n" + TOOL_INSTRUCTIONS

class CompanionBrain:
    def __init__(self, model_name="llama3.2", memory_file="memory.json"):
        self.model_name = model_name
        self.memory_file = memory_file
        self.MEMORY_LIMIT = 20
        self.KEEP_RECENT = 10
        self.messages = self._load_memory()

        if self.messages and self.messages[0]['role'] == 'system':
            self.messages[0]['content'] = FULL_SYSTEM_PROMPT

    def _load_memory(self):
        if os.path.exists(self.memory_file):
            try:
                with open(self.memory_file, 'r') as f:
                    return json.load(f)
            except json.JSONDecodeError:
                return [{"role": "system", "content": FULL_SYSTEM_PROMPT}]
        return [{"role": "system", "content": FULL_SYSTEM_PROMPT}]

    def _save_memory(self):
        with open(self.memory_file, 'w') as f:
            json.dump(self.messages, f, indent=4)

    def _condense_memory(self):
        """Compresses old messages to save RAM."""
        print("...Compacting Memory...")
        if len(self.messages) < (self.KEEP_RECENT + 2):
            return

        to_summarize = self.messages[1 : -self.KEEP_RECENT]
        summary_prompt = f"Summarize conversation: {json.dumps(to_summarize)}"
        
        try:
            response = ollama.chat(model=self.model_name, messages=[{'role': 'user', 'content': summary_prompt}])
            summary_text = response['message']['content']
            
            new_memory = [self.messages[0]] 
            new_memory.append({"role": "system", "content": f"Summary: {summary_text}"})
            new_memory.extend(self.messages[-self.KEEP_RECENT:])
            
            self.messages = new_memory
            self._save_memory()
        except Exception as e:
            print(f"Summary failed: {e}")

    def get_response(self, user_input):
        file_context = extract_and_read_file(user_input)
        final_prompt = user_input
        
        if file_context:
            print(f"(Vision System Active: Reading file...)")
            final_prompt = user_input + file_context

        self.messages.append({"role": "user", "content": final_prompt})
        
        if len(self.messages) > self.MEMORY_LIMIT:
            self._condense_memory()
        
        try:
            response = ollama.chat(model=self.model_name, messages=self.messages)
            ai_message = response['message']['content']
            tool_match = re.search(r'\[\[OPEN:\s*(.*?)\]\]', ai_message, re.IGNORECASE)
            
            if tool_match:
                app_to_open = tool_match.group(1)
                print(f"(Agent Active: Opening {app_to_open}...)")
                
                result = open_application(app_to_open)
                
                self.messages.append({"role": "assistant", "content": ai_message})
                self.messages.append({"role": "system", "content": result})
                self._save_memory()
                
                return f"Opening {app_to_open} for you."
            
            self.messages.append({"role": "assistant", "content": ai_message})
            self._save_memory()
            return ai_message

        except Exception as e:
            return f"Error: {str(e)}"