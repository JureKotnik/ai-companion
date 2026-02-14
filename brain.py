"""
FILE: brain.py
DESCRIPTION: Core intelligence engine with ROBUST Long-Term Memory.
"""

import ollama
import json
import os
import re
from skills import extract_and_read_file, open_application
from config import TEST_MODE

# --- 1. PERSONALITY & INSTRUCTIONS ---
PERSONALITY_INSTRUCTIONS = """
ROLE:
1. You are a close friend. Be detailed, talkative, and affectionate.
2. NEURAL MEMORY: You have a "Long Term Memory" file. You MUST use it.
"""

# --- 2. THE CRITICAL MEMORY INSTRUCTION ---
# We put this in a separate block to inject it forcefully
MEMORY_TOOL_INSTRUCTIONS = """
*** IMPORTANT: MEMORY SAVING TOOL ***
When the user tells you a NEW fact about themselves (name, hobby, age, preference), 
you MUST output a "Remember Tag" to save it to your long-term storage.

Format: [[REMEMBER: The user's name is Jure]]
Format: [[REMEMBER: The user likes programming]]

RULES:
1. Do not ask to save. Just do it.
2. Output the tag anywhere in your response.
3. If the user says "My name is X", you MUST output [[REMEMBER: User name is X]].
"""

EMOTION_INSTRUCTIONS = """
START response with emotion: [Happy], [Sad], [Angry], [Surprised], [Thinking], [Love], [Excited].
"""

try:
    from config import SYSTEM_PROMPT
except ImportError:
    SYSTEM_PROMPT = "You are a professional AI companion."

# Combine prompts - Memory instructions come LAST to be most recent in context
BASE_SYSTEM_PROMPT = f"{SYSTEM_PROMPT}\n{PERSONALITY_INSTRUCTIONS}\n{EMOTION_INSTRUCTIONS}\n{MEMORY_TOOL_INSTRUCTIONS}"

class CompanionBrain:
    def __init__(self, model_name="llama3.1", memory_file="memory.json", ltm_file="long_term_memory.json"):
        self.model_name = model_name
        self.memory_file = memory_file
        self.ltm_file = ltm_file
        self.MEMORY_LIMIT = 30
        self.KEEP_RECENT = 10
        
        self.long_term_facts = self._load_ltm()
        self.messages = self._load_short_term_memory()
        self._update_system_prompt()

    # --- LONG TERM MEMORY ---
    def _load_ltm(self):
        if os.path.exists(self.ltm_file):
            try:
                with open(self.ltm_file, 'r') as f:
                    data = json.load(f)
                    print(f"🧠 [LTM] Loaded {len(data)} permanent memories.")
                    return data
            except: return []
        return []

    def _save_ltm(self):
        if TEST_MODE: 
            print("⚠️ [LTM] Cannot save (TEST_MODE is On)")
            return
        
        try:
            with open(self.ltm_file, 'w') as f:
                json.dump(self.long_term_facts, f, indent=4)
            print("💾 [LTM] Successfully saved to disk.")
        except Exception as e:
            print(f"❌ [LTM] Save Failed: {e}")

    def _add_long_term_memory(self, fact):
        cleaned_fact = fact.strip()
        # Avoid duplicates
        if cleaned_fact not in self.long_term_facts:
            self.long_term_facts.append(cleaned_fact)
            self._save_ltm()
            print(f"📝 [LTM] NEW MEMORY ADDED: {cleaned_fact}")
            self._update_system_prompt()
        else:
            print(f"👀 [LTM] I already know: {cleaned_fact}")

    def _update_system_prompt(self):
        facts_text = ""
        if self.long_term_facts:
            facts_text = "\n[PERMANENT FACTS ABOUT USER]:\n" + "\n".join([f"* {f}" for f in self.long_term_facts])
        
        final_prompt = BASE_SYSTEM_PROMPT + "\n" + facts_text
        
        # Ensure system prompt is always updated/inserted at index 0
        if not self.messages or self.messages[0]['role'] != 'system':
            self.messages.insert(0, {"role": "system", "content": final_prompt})
        else:
            self.messages[0]['content'] = final_prompt

    # --- SHORT TERM MEMORY ---
    def _load_short_term_memory(self):
        if os.path.exists(self.memory_file):
            try: 
                with open(self.memory_file, 'r') as f: return json.load(f)
            except: pass
        return [{"role": "system", "content": BASE_SYSTEM_PROMPT}]

    def _save_short_term_memory(self):
        if TEST_MODE: return
        with open(self.memory_file, 'w') as f:
            json.dump(self.messages, f, indent=4)

    def _condense_memory(self):
        if len(self.messages) < (self.KEEP_RECENT + 5): return
        print("🧹 Condensing Short-Term Memory...")
        
        # Snapshot recent history
        to_summarize = self.messages[1 : -self.KEEP_RECENT]
        prompt = f"Summarize this conversation briefly, keeping key details: {json.dumps(to_summarize)}"
        
        try:
            resp = ollama.chat(model=self.model_name, messages=[{'role': 'user', 'content': prompt}])
            summary = resp['message']['content']
            
            new_mem = [self.messages[0]] # System Prompt
            new_mem.append({"role": "system", "content": f"[Previous Chat Context]: {summary}"})
            new_mem.extend(self.messages[-self.KEEP_RECENT:]) # Recent Messages
            
            self.messages = new_mem
            self._save_short_term_memory()
        except: pass

    # --- MAIN LOOP ---
    def stream_response(self, user_input):
        file_ctx = extract_and_read_file(user_input)
        final_input = user_input + (f"\n[FILE CONTENT]: {file_ctx}" if file_ctx else "")

        self.messages.append({"role": "user", "content": final_input})
        if len(self.messages) > self.MEMORY_LIMIT: self._condense_memory()

        full_response = ""
        try:
            stream = ollama.chat(model=self.model_name, messages=self.messages, stream=True)
            
            for chunk in stream:
                content = chunk['message']['content']
                full_response += content
                yield content

            self.messages.append({"role": "assistant", "content": full_response})
            self._save_short_term_memory()

            # --- PROCESS TOOLS (Hidden from User Output) ---
            
            # 1. Flexible Regex for REMEMBER (Handles spaces like [[ REMEMBER: ... ]])
            # We look for the tag case-insensitive
            ltm_matches = re.findall(r'\[\[\s*REMEMBER\s*:\s*(.*?)\s*\]\]', full_response, re.IGNORECASE)
            
            if ltm_matches:
                print(f"🔎 [Brain] Detected {len(ltm_matches)} memory tags in response.")
                for fact in ltm_matches:
                    self._add_long_term_memory(fact)

            # 2. App Opener
            app_match = re.search(r'\[\[OPEN:\s*(.*?)\]\]', full_response, re.IGNORECASE)
            if app_match:
                yield f"\n[Opening {app_match.group(1)}]"
                open_application(app_match.group(1))

        except Exception as e:
            yield f"Error: {e}"