"""
FILE: brain.py
DESCRIPTION: Core intelligence engine with Streaming capabilities.
"""

import ollama
import json
import os
import re
from skills import extract_and_read_file, open_application

TOOL_INSTRUCTIONS = """
To open an app, output ONLY: [[OPEN: app_name]]
Do not ask for permission.
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

    def stream_response(self, user_input):
        """
        Yields text chunks as they are generated.
        """
        file_context = extract_and_read_file(user_input)
        final_prompt = user_input + file_context if file_context else user_input

        self.messages.append({"role": "user", "content": final_prompt})
        
        if len(self.messages) > self.MEMORY_LIMIT:
            self._condense_memory()
        
        full_response = ""
        
        try:
            stream = ollama.chat(
                model=self.model_name, 
                messages=self.messages, 
                stream=True
            )
            
            for chunk in stream:
                content = chunk['message']['content']
                full_response += content
                yield content

            self.messages.append({"role": "assistant", "content": full_response})
            self._save_memory()
            
            tool_match = re.search(r'\[\[OPEN:\s*(.*?)\]\]', full_response, re.IGNORECASE)
            if tool_match:
                app_to_open = tool_match.group(1)
                yield f"\n[Opening {app_to_open}]"
                open_application(app_to_open)

        except Exception as e:
            yield f"Error: {str(e)}"