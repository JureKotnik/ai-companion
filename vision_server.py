"""
FILE: vision_server.py
DESCRIPTION: Handles screen analysis using LLaVA with deeper context.
"""
import ollama

def analyze_screen(image_data, brain_instance):
    """
    Takes base64 image data, sends it to LLaVA for a DEEP analysis,
    then returns that analysis so the main Brain can digest it.
    """
    print("👀 Astra is analyzing the screen in depth...")

    if "," in image_data:
        image_data = image_data.split(",")[1]

    # NEW PROMPT: Ask for details, text, and context (not just a reaction)
    prompt = (
        "Analyze this screen screenshot in detail. "
        "1. Identify the main active application. "
        "2. Read any prominent text or headlines. "
        "3. Guess what the user is trying to accomplish (coding, reading, gaming, etc). "
        "Provide a factual, detailed summary of the screen state."
    )

    try:
        response = ollama.chat(
            model="llava", 
            messages=[{
                'role': 'user',
                'content': prompt,
                'images': [image_data]
            }]
        )
        
        description = response['message']['content']
        return description

    except Exception as e:
        print(f"Vision Error: {e}")
        return None