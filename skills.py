"""
FILE: skills.py
PROJECT: AI Companion
DESCRIPTION: 
    A collection of 'hard skills' the AI can execute.
    Currently focuses on File I/O (Vision).

LOGIC:
    - try_read_file(user_input): Scans the input for words that look like filenames.
      If a file exists, it returns the content.
"""

import os

def extract_and_read_file(user_input):
    """
    Scans the user input for potential filenames.
    If a valid file is found in the current folder, it returns a formatted block of text.
    """
    words = user_input.split()
    
    found_file = None
    content = None

    for word in words:
        clean_word = word.strip(".,?!'\"")
        if "." in clean_word and os.path.isfile(clean_word):
            found_file = clean_word
            break

    if found_file:
        try:
            with open(found_file, 'r', encoding='utf-8') as f:
                raw_content = f.read()
            if len(raw_content) > 10000:
                raw_content = raw_content[:10000] + "\n...[Content Truncated]..."
                
            return f"\n[SYSTEM INJECTION: The user is referencing the file '{found_file}'. Here is its content:]\n```\n{raw_content}\n```\n"
        except Exception as e:
            return f"\n[SYSTEM: Attempted to read '{found_file}' but failed: {e}]"
            
    return None