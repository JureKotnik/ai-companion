"""
FILE: config_example.py
DESCRIPTION: Template for the private config.py file.
INSTRUCTIONS: Rename this file to config.py and add your custom roles.
"""

SYSTEM_PROMPT = "You are a helpful AI assistant."

EMOTION_MAP = {
    "happy": "Happy", "smile": "Happy", "smiling": "Smiling",
    "sad": "Sad", "cry": "Cry", "depressed": "Sad",
    "angry": "Angry", "mad": "Angry", "wink": "Wink",
    "love": "Love", "blush": "Love", "shy": "Embarrassed",
    "nervous": "Nervous", "scared": "Scared", "sleepy": "Sleepy",
    "amazed": "Amazed", "wow": "Amazed", "surprised": "Surprised",
    "thinking": "Thinking", "laugh": "Laughing", "haha": "Laughing",
    "bored": "Bored", "determined": "Determined",
    "disgusted": "Disgusted", "shocked": "Shocked"
}

PHONETIC_MAP = {
"pfft": "hmph", 
    "lol": "haha", 
    "omg": "oh my god", 
    "wtf": "what the hell",
    "idk": "I don't know", 
    "brb": "be right back", 
    "grr": "urgh", 
    "meh": "meh", 
    "tsk": "tisk", 
    "sus": "suspicious", 
    "ngl": "not gonna lie", 
    "imo": "in my opinion"
}

SOUND_BANK = {
"Surprised": [
        "Whoa!", "Oh!", "Wow!", "My goodness!", "Really?", "No way!"
    ],
    "Laughing": [
        "Haha!", "Hehe!", "That's funny!"
    ],
    "Sad": [
        "Oh...", "Oh dear...", "I'm sorry..."
    ],
    "Angry": [
        "Hey!", "Seriously?", "Stop.", "Excuse me?", "How rude!"
    ],
    "Embarrassed": [
        "Oh my...", "Uh oh...", "Gosh...", "Please..."
    ],
    "Confused": [
        "Wait...", "What?", "Confusing...", "Say again?"
    ],
    "Disgusted": [
        "Gross!", "Yuck!", "Nasty!"
    ],
    "Love": [
        "Aww!", "Darling!", "Sweetie!", "I love that!", "So cute!"
    ],
    "Agreement": [
        "Right.", "Yeah.", "Okay.", "Sure.", "Exactly.", "Totally.", "Of course."
    ]
}
BREATH_SOUNDS = ["Haa...", "Ah...", "Phew...", "Mmm...", "So...", "And..."]

FILLERS = ["Hmm?", "Let's see...", "Okay...", "Well?", "So?", "You know?", "Right?"]

VOICE_STYLES = {
    "Happy":       ("af", 1.2, 1.1),    # Fast + Slightly Louder
    "Excited":     ("af", 1.3, 1.2),    # Very Fast + Loud
    "Laughing":    ("af", 1.25, 1.1),
    "Angry":       ("af", 1.3, 1.4),    # Fast + VERY LOUD (1.4x)
    "Annoyed":     ("af", 1.1, 1.1),    # Sharp + Loud
    "Surprised":   ("af", 1.25, 1.2),   # Fast + Loud

    "Sad":         ("af", 0.75, 0.8),   # Very Slow + Quiet
    "Love":        ("af", 0.85, 0.9),   # Slow + Soft
    "Worry":       ("af", 0.8, 0.85),   # Slow + Quiet
    "Thinking":    ("af", 0.8, 0.8),    # Slow + Quiet
    "Confused":    ("af", 0.85, 0.9),   # Slow + Soft
    "Sleepy":      ("af", 0.7, 0.7),     # Super Slow + Very Quiet
    "Whisper":     ("af", 0.95, 0.3)
}
WAKE_WORD = "astra"
ALWAYS_LISTEN = True

TEST_MODE = True 

QUIET_TRIGGERS = ["quiet mode", "whisper mode", "shh", "be quiet", "late night mode", "keep it down"]
NORMAL_TRIGGERS = ["normal mode", "speak up", "loud mode", "stop whispering", "daytime mode"]