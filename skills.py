"""
FILE: skills.py
PROJECT: AI Companion
DESCRIPTION: 
    A collection of 'hard skills' the AI can execute.
    - File I/O (Vision)
    - App Launching (Agent)
"""

import os
import subprocess
import sys

def extract_and_read_file(user_input):
    """
    Scans the user input for potential filenames.
    If a valid file is found in the current folder, it returns a formatted block of text.
    """
    words = user_input.split()
    
    found_file = None

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

def open_application(app_name):
    """
    Attempts to open a Windows application based on a keyword.
    """
    app_name = app_name.lower().strip()
    
    apps = {
        "chrome": "start chrome",
        "google": "start chrome",
        "notepad": "notepad",
        "calculator": "calc",
        "calc": "calc",
        "explorer": "explorer",
        "spotify": "start spotify",
        "code": "code",
        "vscode": "code",
        "cmd": "start cmd",
        "terminal": "start powershell",
        "brave": "start brave",

    }
    
    command = apps.get(app_name)
    
    if command:
        try:
            subprocess.Popen(command, shell=True)
            return f"[SYSTEM: Successfully opened {app_name}]"
        except Exception as e:
            return f"[SYSTEM: Failed to open {app_name}: {e}]"
    else:
        return f"[SYSTEM: I don't know how to open '{app_name}'. Please add it to skills.py]"