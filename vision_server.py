"""
FILE: vision_server.py
DESCRIPTION: Handles screen analysis using LLaVA.
"""
import ollama
import time
import base64
import re
from io import BytesIO
from PIL import Image

def analyze_screen(image_data, brain_instance):
    """
    Takes base64 image data, sends it to LLaVA, and returns a short reaction.
    """
    print("👀 Astra is looking at the screen...")

    # Clean base64 string
    if "," in image_data:
        image_data = image_data.split(",")[1]

    # Prompt for reactive, continuous commentary
    prompt = (
        "You are watching the user's screen. "
        "Briefly comment on what is happening or what changed. "
        "Be reactive, short, and conversational (1 sentence max). "
        "Do not describe the static layout, focus on the activity."
    )

    try:
        # Use LLaVA specifically for vision
        response = ollama.chat(
            model="llava",  # Vision model
            messages=[{
                'role': 'user',
                'content': prompt,
                'images': [image_data]
            }]
        )
        
        reaction = response['message']['content']
        
        # Add to main brain memory so she remembers what she saw
        brain_instance.messages.append({"role": "assistant", "content": f"[Vision Reaction] {reaction}"})
        
        return reaction

    except Exception as e:
        print(f"Vision Error: {e}")
        return None