import React, { useState, useEffect, useRef } from 'react';

const ROWS = 6;
const COLS = 5;
const KEYBOARD_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Z','X','C','V','B','N','M']
];

export default function Wordle() {
  const cardRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [guesses, setGuesses] = useState(Array.from({ length: ROWS }, () => Array(COLS).fill('')));
  const [results, setResults] = useState(Array.from({ length: ROWS }, () => Array(COLS).fill('')));
  const [currentRow, setCurrentRow] = useState(0);
  const [currentCol, setCurrentCol] = useState(0);
  const [wordLength, setWordLength] = useState(COLS);
  const [gameOver, setGameOver] = useState(false);
  const [message, setMessage] = useState('');
  const inputRefs = useRef(Array.from({ length: COLS }, () => React.createRef()));
  // modal removed; inline game-over bar used instead
  const [popupWord, setPopupWord] = useState('');
  const [keyboardColors, setKeyboardColors] = useState({});
  const [toast, setToast] = useState({ text: '', type: 'info' });
  const [toastVisible, setToastVisible] = useState(false);
  const [shakeRow, setShakeRow] = useState(false);

  useEffect(() => {
    // Request a new target word each time the app loads, so the answer changes per session
    fetch('http://localhost:5000/wordle/new', { method: 'POST' })
      .then(res => res.json())
      .then(data => setWordLength(data.length))
      .catch(() => {
        // Fallback: just read current word length if new-game endpoint fails
        fetch('http://localhost:5000/wordle/word')
          .then(res => res.json())
          .then(data => setWordLength(data.length))
          .catch(() => setMessage('Could not connect to backend.'));
      });
  }, []);

  useEffect(() => {
    if (!gameOver) {
      inputRefs.current[currentCol]?.current?.focus();
    }
  }, [currentCol, currentRow, gameOver]);

  // compute scale to fit card in viewport and prevent page scrollbars
  useEffect(() => {
    const computeScale = () => {
      const card = cardRef.current;
      if (!card) return setScale(1);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rect = card.getBoundingClientRect();
      const pad = 32; // safe padding
      const sx = (vw - pad) / rect.width;
      const sy = (vh - pad) / rect.height;
      const s = Math.min(1, sx, sy);
      setScale(s);
    };
    computeScale();
    window.addEventListener('resize', computeScale);
    // prevent page scrollbars while the app is mounted and set background to black
    const prevOverflow = document.body.style.overflow;
    const prevBg = document.body.style.background;
    document.body.style.overflow = 'hidden';
    document.body.style.background = '#000';
    return () => {
      window.removeEventListener('resize', computeScale);
      document.body.style.overflow = prevOverflow;
      document.body.style.background = prevBg;
    };
  }, []);

  // Update keyboard colors based on results
  useEffect(() => {
    const colors = {};
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const letter = guesses[r][c];
        const res = results[r][c];
        if (!letter) continue;
        const L = letter.toUpperCase();
        if (res === 'correct') colors[L] = '#6aaa64';
        else if (res === 'present' && colors[L] !== '#6aaa64') colors[L] = '#c9b458';
        else if (res === 'absent' && !colors[L]) colors[L] = '#787c7e';
      }
    }
    setKeyboardColors(colors);
  }, [results, guesses]);

  const handleCellChange = (e, colIdx) => {
    if (gameOver) return;
    const v = e.target.value.toUpperCase().slice(-1);
    if (v && !/^[A-Z]$/.test(v)) return;
    setGuesses(prev => {
      const copy = prev.map(r => [...r]);
      copy[currentRow][colIdx] = v || '';
      return copy;
    });
    if (v && colIdx < wordLength - 1) setCurrentCol(colIdx + 1);
  };

  const submitGuess = async () => {
    if (gameOver) return;
    const guessWord = guesses[currentRow].join('').toLowerCase();
    if (guessWord.length !== wordLength) {
      setMessage(`Enter a ${wordLength}-letter word.`);
      return;
    }
    // validate word via proxy then public API
    let dictData = null;
    try {
      const r = await fetch(`http://localhost:5001/api/define/${guessWord}`);
      dictData = await r.json();
    } catch (e) {
      try {
        const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${guessWord}`);
        dictData = await r.json();
      } catch (e2) {
        setMessage('Could not connect to dictionary API.');
        return;
      }
    }
    if (!Array.isArray(dictData) || !dictData[0]?.word) {
      // show a nicer toast + shake animation for invalid word
      setToast({ text: 'Not in word list', type: 'error' });
      setToastVisible(true);
      setShakeRow(true);
      setTimeout(() => setShakeRow(false), 700);
      setTimeout(() => setToastVisible(false), 2200);
      return;
    }

    // submit to backend for feedback
    try {
      const res = await fetch('http://localhost:5000/wordle/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: guessWord })
      });
      const data = await res.json();
      setResults(prev => {
        const copy = prev.map(r => [...r]);
        copy[currentRow] = data.result;
        return copy;
      });
      // move to next row or end
      if (data.result.every(x => x === 'correct')) {
        setGameOver(true);
        setMessage('You guessed it!');
        // fetch answer for popup (so user can Play again)
        try {
          const r2 = await fetch('http://localhost:5000/wordle/answer');
          const j = await r2.json();
          setPopupWord((j.answer || guessWord).toUpperCase());
        } catch (e) {
          setPopupWord(guessWord.toUpperCase());
        }
  // show popup removed; using inline game-over bar
      } else if (currentRow === ROWS - 1) {
        setGameOver(true);
        setMessage('Game over');
        // fetch answer for popup
        try {
          const r2 = await fetch('http://localhost:5000/wordle/answer');
          const j = await r2.json();
          setPopupWord((j.answer || '').toUpperCase());
        } catch (e) {
          setPopupWord('');
        }
  // show popup removed; using inline game-over bar
      } else {
        setCurrentRow(currentRow + 1);
        setCurrentCol(0);
        setMessage('');
      }
    } catch (e) {
      setMessage('Could not connect to backend.');
    }
  };

  const handleKeyDown = (e, colIdx) => {
    if (e.key === 'Backspace') {
      if (guesses[currentRow][colIdx]) {
        setGuesses(prev => {
          const copy = prev.map(r => [...r]);
          copy[currentRow][colIdx] = '';
          return copy;
        });
      } else if (colIdx > 0) setCurrentCol(colIdx - 1);
    } else if (e.key === 'Enter') {
      submitGuess();
    } else if (e.key === 'ArrowLeft' && colIdx > 0) setCurrentCol(colIdx - 1);
    else if (e.key === 'ArrowRight' && colIdx < wordLength - 1) setCurrentCol(colIdx + 1);
  };

  const handleKeyboardClick = (k) => {
    if (gameOver) return;
    const col = currentCol;
    setGuesses(prev => {
      const copy = prev.map(r => [...r]);
      copy[currentRow][col] = k;
      return copy;
    });
    if (col < wordLength - 1) setCurrentCol(col + 1);
  };

  const playAgain = async () => {
    try {
      const r = await fetch('http://localhost:5000/wordle/new', { method: 'POST' });
      try {
        const j = await r.json();
        if (typeof j.length === 'number') setWordLength(j.length);
      } catch (e) { }
    } catch (e) { }
    setGuesses(Array.from({ length: ROWS }, () => Array(COLS).fill('')));
    setResults(Array.from({ length: ROWS }, () => Array(COLS).fill('')));
    setCurrentRow(0);
    setCurrentCol(0);
    setGameOver(false);
    setPopupWord('');
    setMessage('');
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 12, background: 'linear-gradient(180deg,#f3f4f6,#e9eef8)', minHeight: '100vh', overflow: 'hidden' }}>
      <div ref={cardRef} style={{ width: 520, background: '#ffffff', padding: 24, borderRadius: 12, boxShadow: '0 8px 24px rgba(15,23,42,0.12)', textAlign: 'center', transform: `scale(${scale})`, transformOrigin: 'top center' }}>
        <h2 style={{ margin: '4px 0 18px', fontFamily: 'Segoe UI, Roboto, system-ui, -apple-system', letterSpacing: 1 }}>Wordle</h2>
        <div style={{ display: 'inline-block' }}>
        <style>{`
          @keyframes shake { 0% { transform: translateX(0) } 20% { transform: translateX(-8px) } 40% { transform: translateX(8px) } 60% { transform: translateX(-6px) } 80% { transform: translateX(6px) } 100% { transform: translateX(0) } }
        `}</style>
        {guesses.map((row, rIdx) => (
          <div key={rIdx} style={{ display: 'flex', justifyContent: 'center', marginBottom: 6, ...(shakeRow && rIdx === currentRow ? { animation: 'shake 0.7s' } : {}) }}>
            {row.map((ch, cIdx) => (
              <input
                key={cIdx}
                ref={rIdx === currentRow ? inputRefs.current[cIdx] : null}
                value={ch}
                onChange={e => handleCellChange(e, cIdx)}
                onKeyDown={e => handleKeyDown(e, cIdx)}
                disabled={rIdx !== currentRow || gameOver}
                maxLength={1}
                style={{
                  width: 56,
                  height: 56,
                  margin: 6,
                  fontSize: 26,
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  background: results[rIdx][cIdx] === 'correct' ? '#6aaa64' : results[rIdx][cIdx] === 'present' ? '#c9b458' : results[rIdx][cIdx] === 'absent' ? '#787c7e' : '#fff',
                  color: results[rIdx][cIdx] ? '#fff' : '#111',
                  border: results[rIdx][cIdx] ? 'none' : '2px solid #e2e8f0',
                  borderRadius: 8,
                  boxShadow: results[rIdx][cIdx] ? 'none' : '0 2px 6px rgba(2,6,23,0.06)',
                  transition: 'transform .08s ease, box-shadow .08s ease'
                }}
              />
            ))}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, minHeight: 20 }}>
        <div style={{ color: message ? '#b91c1c' : 'transparent', fontWeight: 600 }}>{message}</div>
      </div>
      {/* Toast */}
      {toastVisible && (
        <div style={{ position: 'fixed', right: 18, top: 24, background: toast.type === 'error' ? '#ef4444' : '#111827', color: '#fff', padding: '10px 14px', borderRadius: 8, boxShadow: '0 6px 24px rgba(2,6,23,0.18)', zIndex: 60 }}>
          {toast.text}
        </div>
      )}

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        {KEYBOARD_ROWS.map((row, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            {row.map(k => (
              <button key={k} onClick={() => handleKeyboardClick(k)} disabled={gameOver} style={{
                margin: 0, padding: '8px 10px', minWidth: 34, background: keyboardColors[k] || '#f3f4f6', color: keyboardColors[k] ? '#fff' : '#111', border: '1px solid #e6e9ef', borderRadius: 6, cursor: gameOver ? 'not-allowed' : 'pointer', boxShadow: '0 2px 6px rgba(2,6,23,0.04)'
              }}>{k}</button>
            ))}
          </div>
        ))}
      </div>

      {gameOver && (
        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center' }}>
          <div style={{ padding: '10px 14px', background: '#111827', color: '#fff', borderRadius: 8, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>Game over — answer: <strong style={{ marginLeft: 6 }}>{popupWord}</strong></div>
            <button onClick={playAgain} style={{ background: '#fff', color: '#111827', border: 'none', padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>Play again</button>
          </div>
        </div>
      )}
          </div>
    </div>
  );
}
