
from flask import Flask, request, jsonify
from flask_cors import CORS
import random
import os
import json
import requests

app = Flask(__name__)
CORS(app)

# Load word list from words.txt (only 5-letter words will be used)
# We'll fetch random 5-letter words from an external API instead of a local file.
FALLBACK_WORDS = [
    'apple', 'grape', 'peach', 'melon', 'berry', 'mango', 'lemon', 'cherry', 'plum', 'olive',
    'pearl', 'cider', 'paper', 'cabin', 'train', 'sound', 'river', 'cloud', 'stone', 'pilot'
]


def fetch_random_word_from_api():
    """Try to fetch a random 5-letter word from a public API.
    Uses random-word-api.herokuapp.com as the primary source.
    Returns a lowercase 5-letter word or None on failure.
    """
    endpoints = [
        'https://random-word-api.herokuapp.com/word?number=1&length=5',
        'https://random-word-api.vercel.app/api?words=1&length=5'
    ]
    for url in endpoints:
        for attempt in range(3):
            try:
                r = requests.get(url, timeout=5)
                if r.status_code == 200:
                    try:
                        arr = r.json()
                    except Exception:
                        arr = None
                    if isinstance(arr, list) and len(arr) > 0:
                        w = str(arr[0]).strip().lower()
                        if len(w) == 5 and w.isalpha():
                            return w
            except Exception:
                # small retry gap
                continue
    return None

STATE_FILE = os.path.join(os.path.dirname(__file__), 'game_state.json')


def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                w = data.get('target')
                if isinstance(w, str) and len(w) == 5 and w.isalpha():
                    return w.lower()
        except Exception:
            pass
    return None


def save_state(word):
    try:
        with open(STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump({'target': word}, f)
    except Exception:
        pass


# Load persisted word or pick a random word at startup
_loaded = load_state()
if _loaded:
    TARGET_WORD = _loaded
else:
    api_word = fetch_random_word_from_api()
    if api_word:
        TARGET_WORD = api_word
    else:
        TARGET_WORD = random.choice(FALLBACK_WORDS)
    save_state(TARGET_WORD)

@app.route('/wordle/guess', methods=['POST'])
def guess():
    data = request.get_json()
    guess_word = data.get('word', '').lower()
    if len(guess_word) != len(TARGET_WORD):
        return jsonify({'error': 'Invalid word length'}), 400
    # Wordle rules: mark correct letters first, then present letters limited by counts
    target = TARGET_WORD
    result = ['absent'] * len(guess_word)
    # count letters in target
    counts = {}
    for ch in target:
        counts[ch] = counts.get(ch, 0) + 1
    # First pass: correct letters
    for i, ch in enumerate(guess_word):
        if i < len(target) and ch == target[i]:
            result[i] = 'correct'
            counts[ch] -= 1
    # Second pass: present (but only up to remaining counts)
    for i, ch in enumerate(guess_word):
        if result[i] == 'correct':
            continue
        if counts.get(ch, 0) > 0:
            result[i] = 'present'
            counts[ch] -= 1
        else:
            result[i] = 'absent'

    return jsonify({'result': result, 'target_length': len(TARGET_WORD)})

@app.route('/wordle/word', methods=['GET'])
def get_word_length():
    return jsonify({'length': len(TARGET_WORD)})

@app.route('/wordle/answer', methods=['GET'])
def get_word_answer():
    # Demo helper: return the target word so frontend can display it when game ends.
    return jsonify({'answer': TARGET_WORD})


@app.route('/wordle/new', methods=['POST', 'GET'])
def new_game():
    """Start a new game by choosing a new target word."""
    global TARGET_WORD
    api_word = fetch_random_word_from_api()
    source = 'fallback'
    if api_word:
        TARGET_WORD = api_word
        source = 'api'
    else:
        TARGET_WORD = random.choice(FALLBACK_WORDS)
    save_state(TARGET_WORD)
    print(f"[wordle] new target selected: {TARGET_WORD} (source={source})")
    # Return the chosen word so the frontend can verify a new target was set.
    resp = {'length': len(TARGET_WORD), 'source': source, 'word': TARGET_WORD}
    return jsonify(resp)

if __name__ == '__main__':
    app.run(debug=True)
