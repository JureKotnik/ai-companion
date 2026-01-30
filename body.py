"""
FILE: body.py
PROJECT: AI Companion
DESCRIPTION: 
    Controls a VTube Studio model via API on Port 8001.
    - Uses a persistent background Event Loop to fix connection crashes.
"""

import asyncio
import pyvts
import threading
import time

class CompanionBody:
    def __init__(self):
        self.plugin_info = {
            "plugin_name": "Astra AI Brain",
            "developer": "You",
            "authentication_token_path": "./vts_token.txt"
        }
        
        self.vts = pyvts.vts(plugin_info=self.plugin_info, port=8001)
        self.is_connected = False
        
        self.loop = asyncio.new_event_loop()
        
        threading.Thread(target=self._run_event_loop, daemon=True).start()

        asyncio.run_coroutine_threadsafe(self._async_connect(), self.loop)

    def _run_event_loop(self):
        """Keeps the background thread alive to listen for commands."""
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    async def _async_connect(self):
        """The actual connection logic running inside the background loop."""
        try:
            print(f"[Body] Connecting to VTube Studio on Port 8001...")
            await self.vts.connect()
            await self.vts.request_authenticate_token()
            await self.vts.request_authenticate()
            print("[Body] Connected to VTube Studio Successfully!")
            self.is_connected = True
        except Exception as e:
            print(f"[Body] Connection Failed. Is VTube Studio open? Error: {e}")

    def trigger_hotkey(self, hotkey_name):
        """Triggers an expression by sending a task to the background loop."""
        if not self.is_connected: 
            print(f"[Body] Cannot trigger '{hotkey_name}' - Not connected yet.")
            return
        
        print(f"[Body] Triggering Hotkey: {hotkey_name}")
        
        asyncio.run_coroutine_threadsafe(
            self._send_hotkey_request(hotkey_name), 
            self.loop
        )

    async def _send_hotkey_request(self, hotkey_name):
        """The async task that actually talks to VTube Studio."""
        try:
            await self.vts.request(
                self.vts.vts_request.requestTriggerHotKey(hotkey_name)
            )
        except Exception as e:
            print(f"[Body] Error triggering hotkey: {e}")

    def set_mood(self, text):
        """
        Analyzes text and triggers the corresponding VTube Studio hotkey.
        """
        text = text.lower()
        
        if any(w in text for w in ["happy", "great", "love", "exciting", "cute", "thanks"]):
            self.trigger_hotkey("Heart Eyes") 
            
        elif any(w in text for w in ["angry", "hate", "mad", "stupid", "kill", "die"]):
            self.trigger_hotkey("Angry")
            
        elif any(w in text for w in ["wow", "what?", "really", "omg", "incredible"]):
            self.trigger_hotkey("Surprised")

        elif any(w in text for w in ["whatever", "ugh", "roll eyes", "annoying"]):
            self.trigger_hotkey("Eye Roll")

        elif any(w in text for w in ["shy", "blush", "embarrassed", "uhm"]):
            self.trigger_hotkey("Blushing")
            
        elif any(w in text for w in ["reset", "calm", "okay", "so", "well"]):
            self.trigger_hotkey("Reset Eyes")
            self.trigger_hotkey("Blush Off")
            self.trigger_hotkey("Dark Face Off")

if __name__ == "__main__":
    body = CompanionBody()
    
    print("Waiting 5 seconds for connection...")
    time.sleep(5) 
    
    print("Testing: Happy")
    body.set_mood("I am so happy and in love!")
    
    time.sleep(3)
    
    print("Testing: Reset")
    body.set_mood("Okay, let's reset.")
    
    time.sleep(2)