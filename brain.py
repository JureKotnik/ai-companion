"""
FILE: brain.py
PROJECT: AI Companion (Local Edition)
DESCRIPTION: 
    Core intelligence engine with Automatic Memory Management.
    
    Key Features:
    - Local Llama 3.2 Inference.
    - Persistent JSON Memory.
    - Context Summarization: Automatically condenses chat history 
      when it exceeds a specific threshold to maintain performance.

DEPENDENCIES: ollama, json, os, config

LOGIC FLOW:
    - get_response: 
        1. Checks memory length. 
        2. Triggers _condense_memory if count > LIMIT.
        3. Generates response.
        4. Saves data.
"""

import ollama
import json
import os

try:
    from config import SYSTEM_PROMPT
except ImportError:
    SYSTEM_PROMPT = "You are a professional AI companion."

class CompanionBrain:
    def __init__(self, model_name="llama3.2", memory_file="memory.json"):
        self.model_name = model_name
        self.memory_file = memory_file
        self.messages = self._load_memory()
        self.MEMORY_LIMIT = 20
        self.KEEP_RECENT = 10

        if self.messages and self.messages[0]['role'] == 'system':
            self.messages[0]['content'] = SYSTEM_PROMPT

    def _load_memory(self):
        if os.path.exists(self.memory_file):
            try:
                with open(self.memory_file, 'r') as f:
                    return json.load(f)
            except json.JSONDecodeError:
                return [{"role": "system", "content": SYSTEM_PROMPT}]
        return [{"role": "system", "content": SYSTEM_PROMPT}]

    def _save_memory(self):
        with open(self.memory_file, 'w') as f:
            json.dump(self.messages, f, indent=4)

    def _condense_memory(self):
        """
        Compresses the middle section of the conversation into a summary
        to save tokens while retaining context.
        """
        print("...Compacting Memory (Optimizing Context)...")
        
        to_summarize = self.messages[1 : -self.KEEP_RECENT]
        
        summary_prompt = f"Summarize the following conversation details concisely: {json.dumps(to_summarize)}"
        
        response = ollama.chat(
            model=self.model_name,
            messages=[{'role': 'user', 'content': summary_prompt}]
        )
        summary_text = response['message']['content']
        
        new_memory = [self.messages[0]]
        new_memory.append({
            "role": "system", 
            "content": f"[Previous Conversation Summary]: {summary_text}"
        })
        new_memory.extend(self.messages[-self.KEEP_RECENT:])
        
        self.messages = new_memory
        self._save_memory()

    def get_response(self, user_input):
        self.messages.append({"role": "user", "content": user_input})
        
        if len(self.messages) > self.MEMORY_LIMIT:
            self._condense_memory()
        
        try:
            response = ollama.chat(model=self.model_name, messages=self.messages)
            ai_message = response['message']['content']
            
            self.messages.append({"role": "assistant", "content": ai_message})
            self._save_memory()
            
            return ai_message
        except Exception as e:
            return f"Error: {str(e)}"