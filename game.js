(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const layerTrack = $('layerTrack');
  const files = 'abcdefgh';
  const glyphs = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
  const names = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' };
  const backRank = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  let board, turn, selected, selectedMoves, layer = 0, flipped = false, history, captured, gameOver, moveNumber, toastTimer;

  const key = (x, y, z) => `${x},${y},${z}`;
  const split = (k) => k.split(',').map(Number);
  const inside = (x, y, z) => x >= 0 && x < 8 && y >= 0 && y < 8 && z >= 0 && z < 8;
  const cloneBoard = (source) => new Map([...source].map(([k, p]) => [k, { ...p }]));
  const pieceAt = (x, y, z) => board.get(key(x, y, z));
  const coord = (k) => { const [x, y, z] = split(k); return `${files[x]}${y + 1}·L${z + 1}`; };
  const colorName = (c) => c === 'w' ? 'White' : 'Black';

  function setup() {
    board = new Map();
    for (let x = 0; x < 8; x++) {
      board.set(key(x, 0, 0), { color: 'w', type: backRank[x] });
      board.set(key(x, 1, 0), { color: 'w', type: 'P' });
      board.set(key(x, 7, 7), { color: 'b', type: backRank[x] });
      board.set(key(x, 6, 7), { color: 'b', type: 'P' });
    }
    turn = 'w'; selected = null; selectedMoves = []; history = []; captured = { w: [], b: [] };
    gameOver = false; moveNumber = 1; layer = 0;
    render();
  }

  function directions(type) {
    const dirs = [];
    if (type === 'R' || type === 'Q') {
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        if (Math.abs(a) + Math.abs(b) + Math.abs(c) === 1) dirs.push([a, b, c]);
      }
    }
    if (type === 'B' || type === 'Q') {
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const nonzero = [a, b, c].filter(Boolean).length;
        if (nonzero >= 2 && !(type === 'Q' && nonzero === 1)) dirs.push([a, b, c]);
      }
    }
    if (type === 'K') {
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (a || b || c) dirs.push([a, b, c]);
    }
    return dirs;
  }

  function knightOffsets() {
    const out = [];
    for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let z = -2; z <= 2; z++) {
      const a = [Math.abs(x), Math.abs(y), Math.abs(z)].sort((m, n) => n - m);
      if ((a[0] === 2 && a[1] === 1 && a[2] === 0) || (a[0] === 2 && a[1] === 1 && a[2] === 1)) out.push([x, y, z]);
    }
    return out;
  }
  const KNIGHT_OFFSETS = knightOffsets();

  function pseudoMoves(from, attacksOnly = false) {
    const [x, y, z] = split(from), piece = board.get(from);
    if (!piece) return [];
    const moves = [];
    if (piece.type === 'P') {
      const forward = piece.color === 'w' ? 1 : -1;
      if (attacksOnly) {
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          if ((!dx && !dy) || !inside(x + dx, y + dy, z + forward)) continue;
          moves.push(key(x + dx, y + dy, z + forward));
        }
        return moves;
      }
      const nz = z + forward;
      if (inside(x, y, nz) && !board.has(key(x, y, nz))) {
        moves.push(key(x, y, nz));
        const startZ = piece.color === 'w' ? 0 : 7;
        const nnz = z + forward * 2;
        if (z === startZ && inside(x, y, nnz) && !board.has(key(x, y, nnz))) moves.push(key(x, y, nnz));
      }
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if ((!dx && !dy) || !inside(x + dx, y + dy, nz)) continue;
        const target = board.get(key(x + dx, y + dy, nz));
        if (target && target.color !== piece.color && target.type !== 'K') moves.push(key(x + dx, y + dy, nz));
      }
      return moves;
    }
    if (piece.type === 'N') {
      for (const [dx, dy, dz] of KNIGHT_OFFSETS) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (!inside(nx, ny, nz)) continue;
        const target = board.get(key(nx, ny, nz));
        if (attacksOnly || !target || (target.color !== piece.color && target.type !== 'K')) moves.push(key(nx, ny, nz));
      }
      return moves;
    }
    const slide = piece.type === 'R' || piece.type === 'B' || piece.type === 'Q';
    for (const [dx, dy, dz] of directions(piece.type)) {
      let nx = x + dx, ny = y + dy, nz = z + dz;
      while (inside(nx, ny, nz)) {
        const target = board.get(key(nx, ny, nz));
        if (attacksOnly) {
          moves.push(key(nx, ny, nz));
          if (target) break;
        } else if (!target) moves.push(key(nx, ny, nz));
        else {
          if (target.color !== piece.color && target.type !== 'K') moves.push(key(nx, ny, nz));
          break;
        }
        if (!slide) break;
        nx += dx; ny += dy; nz += dz;
      }
    }
    return moves;
  }

  function isAttacked(square, byColor) {
    for (const [from, p] of board) if (p.color === byColor && pseudoMoves(from, true).includes(square)) return true;
    return false;
  }
  function kingSquare(color) {
    for (const [k, p] of board) if (p.color === color && p.type === 'K') return k;
    return null;
  }
  function inCheck(color) {
    const king = kingSquare(color);
    return king ? isAttacked(king, color === 'w' ? 'b' : 'w') : true;
  }
  function tryMove(from, to) {
    const piece = board.get(from), taken = board.get(to);
    board.delete(from); board.delete(to);
    const moved = { ...piece };
    const [, , z] = split(to);
    if (moved.type === 'P' && ((moved.color === 'w' && z === 7) || (moved.color === 'b' && z === 0))) moved.type = 'Q';
    board.set(to, moved);
    const safe = !inCheck(piece.color);
    board.delete(to); board.set(from, piece); if (taken) board.set(to, taken);
    return safe;
  }
  function legalMoves(from) {
    const piece = board.get(from);
    if (!piece) return [];
    return pseudoMoves(from).filter((to) => tryMove(from, to));
  }
  function hasLegalMove(color) {
    for (const [from, piece] of board) if (piece.color === color) {
      for (const to of pseudoMoves(from)) if (tryMove(from, to)) return true;
    }
    return false;
  }

  function makeMove(from, to) {
    if (gameOver) return;
    const piece = board.get(from), capturedPiece = board.get(to);
    const before = { board: cloneBoard(board), turn, captured: { w: [...captured.w], b: [...captured.b] }, moveNumber, gameOver, lastMove: history.length ? history[history.length - 1].to : null };
    const [tx, ty, tz] = split(to);
    board.delete(from); board.delete(to);
    let promotion = false;
    const moved = { ...piece };
    if (piece.type === 'P' && ((piece.color === 'w' && tz === 7) || (piece.color === 'b' && tz === 0))) { moved.type = 'Q'; promotion = true; }
    board.set(to, moved);
    if (capturedPiece) captured[piece.color].push(capturedPiece);
    const notation = `${piece.type === 'P' ? '' : piece.type}${coord(from)}${capturedPiece ? '×' : '→'}${coord(to)}${promotion ? '=Q' : ''}`;
    history.push({ ...before, from, to, piece: { ...piece }, capturedPiece, notation });
    turn = turn === 'w' ? 'b' : 'w';
    if (piece.color === 'b') moveNumber++;
    selected = null; selectedMoves = []; layer = tz;
    const check = inCheck(turn);
    if (!hasLegalMove(turn)) gameOver = true;
    render();
    if (gameOver) showToast(check ? `${colorName(piece.color).toUpperCase()} WINS · CHECKMATE` : 'DRAW · STALEMATE');
    else if (promotion) showToast('PAWN PROMOTED TO QUEEN');
    else if (check) showToast(`${colorName(turn).toUpperCase()} KING IN CHECK`);
  }

  function undo() {
    const prev = history.pop();
    if (!prev) return;
    board = prev.board; turn = prev.turn; captured = prev.captured; moveNumber = prev.moveNumber; gameOver = prev.gameOver;
    layer = split(prev.from)[2]; selected = null; selectedMoves = [];
    render(); showToast('MOVE UNDONE');
  }

  function render() {
    renderBoard(); renderLayers(); renderTurn(); renderCaptures(); renderHistory();
    $('undoButton').disabled = history.length === 0;
    $('turnFoot').textContent = gameOver ? (inCheck(turn) ? `${colorName(turn).toUpperCase()} · CHECKMATE` : 'STALEMATE') : `${colorName(turn).toUpperCase()} TO MOVE`;
    $('boardHint').textContent = selected ? `${selectedMoves.length} LEGAL MOVE${selectedMoves.length === 1 ? '' : 'S'} · CHANGE LAYER TO MOVE` : 'Select a piece to see its paths';
  }
  function renderBoard() {
    $('layerLabel').textContent = `LAYER ${String(layer + 1).padStart(2, '0')}`;
    $('layerCoord').textContent = `z = ${layer}`;
    boardEl.innerHTML = '';
    $('rankLabels').innerHTML = '';
    $('fileLabels').innerHTML = '';
    const ranks = [], fileNames = [];
    for (let r = 0; r < 8; r++) ranks.push(flipped ? r + 1 : 8 - r);
    for (let c = 0; c < 8; c++) fileNames.push(files[flipped ? 7 - c : c]);
    $('rankLabels').innerHTML = ranks.map((n) => `<span>${n}</span>`).join('');
    $('fileLabels').innerHTML = fileNames.map((f) => `<span>${f}</span>`).join('');
    const last = history.length ? history[history.length - 1] : null;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const x = flipped ? 7 - c : c, y = flipped ? r : 7 - r, k = key(x, y, layer), piece = board.get(k);
      const cell = document.createElement('button');
      cell.type = 'button'; cell.className = `square ${(x + y) % 2 ? 'dark' : 'light'}`;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', `${files[x]}${y + 1}${piece ? ` ${colorName(piece.color)} ${names[piece.type]}` : ' empty'}${selectedMoves.includes(k) ? ', legal move' : ''}`);
      cell.dataset.square = k; cell.dataset.coord = `${files[x]}${y + 1}`;
      if (selected === k) cell.classList.add('selected');
      if (last && (last.from === k || last.to === k)) cell.classList.add('last-move');
      if (selectedMoves.includes(k)) cell.classList.add(piece ? 'legal-capture' : 'legal-dot');
      if (selected === k) cell.classList.add('move-source');
      if (piece) cell.innerHTML = `<span class="piece ${piece.color === 'w' ? 'white' : 'black'}">${glyphs[piece.type]}</span>`;
      cell.addEventListener('click', onSquareClick);
      boardEl.appendChild(cell);
    }
  }
  function renderLayers() {
    layerTrack.innerHTML = '';
    for (let z = 0; z < 8; z++) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = `layer-button${z === layer ? ' active' : ''}`;
      const occupied = [...board].filter(([k]) => split(k)[2] === z).map(([, p]) => p);
      if (occupied.some((p) => p.color === 'w')) button.classList.add('has-white');
      if (occupied.some((p) => p.color === 'b')) button.classList.add('has-black');
      if (selectedMoves.some((move) => split(move)[2] === z)) button.classList.add('has-legal-moves');
      button.textContent = String(z + 1).padStart(2, '0');
      button.setAttribute('aria-label', `Layer ${z + 1}${z === layer ? ', selected' : ''}`);
      button.setAttribute('aria-pressed', z === layer);
      button.addEventListener('click', () => { layer = z; render(); });
      layerTrack.appendChild(button);
    }
  }
  function renderTurn() {
    $('playerName').textContent = gameOver ? (inCheck(turn) ? `${colorName(turn)} is checkmated` : 'Draw') : `${colorName(turn)} to move`;
    $('playerSub').textContent = gameOver ? 'Match complete' : selected ? 'Choose a glowing destination' : 'Select a piece on the cube';
    $('turnPiece').textContent = turn === 'w' ? '♙' : '♟';
    $('turnPiece').classList.toggle('black-turn', turn === 'b');
    $('roundLabel').textContent = `MOVE ${String(moveNumber).padStart(2, '0')}`;
    $('turnProgress').classList.toggle('black-progress', turn === 'b');
    $('checkAlert').hidden = !(!gameOver && inCheck(turn));
  }
  function renderCaptures() {
    for (const color of ['w', 'b']) {
      const list = captured[color];
      const target = $(color === 'w' ? 'whiteCaptured' : 'blackCaptured');
      target.innerHTML = list.map((p) => `<span class="captured-icon ${p.color === 'w' ? 'white' : 'black'}">${glyphs[p.type]}</span>`).join('');
      $(color === 'w' ? 'whiteCaptureCount' : 'blackCaptureCount').textContent = String(list.length);
    }
  }
  function renderHistory() {
    const list = $('moveList');
    if (!history.length) {
      list.innerHTML = '<div class="empty-moves"><span>01</span><div><b>The cube awaits.</b><br>Make the first move.</div></div>';
      return;
    }
    const rows = [];
    for (let i = 0; i < history.length; i += 2) {
      rows.push(`<div class="move-pair"><span class="move-number">${String(Math.floor(i / 2) + 1).padStart(2, '0')}</span><span class="move-entry${i === history.length - 1 ? ' latest' : ''}">${history[i].notation}</span><span class="move-entry${i + 1 === history.length - 1 ? ' latest' : ''}">${history[i + 1] ? history[i + 1].notation : ''}</span></div>`);
    }
    list.innerHTML = rows.join(''); list.scrollTop = list.scrollHeight;
  }
  function onSquareClick(event) {
    if (gameOver) return;
    const k = event.currentTarget.dataset.square, clicked = board.get(k);
    if (selected && selectedMoves.includes(k)) { makeMove(selected, k); return; }
    if (clicked && clicked.color === turn) {
      selected = k; selectedMoves = legalMoves(k); layer = split(k)[2]; render(); return;
    }
    if (selected) { selected = null; selectedMoves = []; render(); }
  }
  function showToast(message) {
    const t = $('toast'); t.textContent = message; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function changeLayer(delta) { layer = Math.max(0, Math.min(7, layer + delta)); render(); }

  $('undoButton').addEventListener('click', undo);
  $('newGameButton').addEventListener('click', setup);
  $('flipButton').addEventListener('click', () => { flipped = !flipped; render(); });
  $('rulesButton').addEventListener('click', () => { $('modalBackdrop').hidden = false; $('modalClose').focus(); });
  $('modalClose').addEventListener('click', () => { $('modalBackdrop').hidden = true; });
  $('modalBackdrop').addEventListener('click', (e) => { if (e.target === $('modalBackdrop')) $('modalBackdrop').hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!$('modalBackdrop').hidden) $('modalBackdrop').hidden = true; else { selected = null; selectedMoves = []; render(); } }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); changeLayer(1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); changeLayer(-1); }
  });
  setup();
})();
