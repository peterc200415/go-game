// ============ Go (Weiqi) Game Logic Engine ============

/**
 * Board representation:
 *   '' = empty, 'B' = black stone, 'W' = white stone
 */

export function createBoard(size = 19) {
    return Array.from({ length: size }, () => Array(size).fill(''));
}

export function cloneBoard(board) {
    return board.map(row => [...row]);
}

function inBounds(r, c, size) {
    return r >= 0 && r < size && c >= 0 && c < size;
}

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

/**
 * Get connected group of same-color stones starting from (r, c)
 * Returns { stones: Set<string>, liberties: Set<string> }
 */
export function getGroup(board, r, c) {
    const size = board.length;
    const color = board[r][c];
    if (!color) return { stones: new Set(), liberties: new Set() };

    const stones = new Set();
    const liberties = new Set();
    const stack = [[r, c]];

    while (stack.length > 0) {
        const [cr, cc] = stack.pop();
        const key = `${cr},${cc}`;
        if (stones.has(key)) continue;
        stones.add(key);

        for (const [dr, dc] of DIRS) {
            const nr = cr + dr, nc = cc + dc;
            if (!inBounds(nr, nc, size)) continue;
            const nkey = `${nr},${nc}`;
            if (board[nr][nc] === '') {
                liberties.add(nkey);
            } else if (board[nr][nc] === color && !stones.has(nkey)) {
                stack.push([nr, nc]);
            }
        }
    }

    return { stones, liberties };
}

/**
 * Remove a group of stones from the board
 * Returns the number of stones captured
 */
export function removeGroup(board, group) {
    let count = 0;
    for (const key of group.stones) {
        const [r, c] = key.split(',').map(Number);
        board[r][c] = '';
        count++;
    }
    return count;
}

/**
 * Get the opponent color
 */
export function opponentColor(color) {
    return color === 'B' ? 'W' : 'B';
}

/**
 * Try to place a stone and get the resulting board state.
 * Returns { board, captured, capturedStones } or null if invalid.
 * Does NOT check ko — caller must verify ko externally.
 */
export function tryPlaceStone(board, r, c, color) {
    const size = board.length;
    if (!inBounds(r, c, size) || board[r][c] !== '') return null;

    const newBoard = cloneBoard(board);
    newBoard[r][c] = color;
    const opp = opponentColor(color);

    // 1. Capture opponent groups with no liberties
    let captured = 0;
    let capturedStones = [];
    for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc, size) || newBoard[nr][nc] !== opp) continue;
        const group = getGroup(newBoard, nr, nc);
        if (group.liberties.size === 0) {
            for (const key of group.stones) {
                capturedStones.push(key.split(',').map(Number));
            }
            captured += removeGroup(newBoard, group);
        }
    }

    // 2. Check self-capture (suicide) — not allowed
    const selfGroup = getGroup(newBoard, r, c);
    if (selfGroup.liberties.size === 0) {
        return null; // Suicide is illegal
    }

    return { board: newBoard, captured, capturedStones };
}

/**
 * Serialize board state to a string for ko detection
 */
export function boardHash(board) {
    return board.map(row => row.map(c => c || '.').join('')).join('|');
}

/**
 * Check if a move is valid
 * @param {Array} board - current board
 * @param {number} r - row
 * @param {number} c - col
 * @param {string} color - 'B' or 'W'
 * @param {string|null} koHash - board hash of the ko-forbidden state
 * @returns {boolean}
 */
export function isValidMove(board, r, c, color, koHash = null) {
    const result = tryPlaceStone(board, r, c, color);
    if (!result) return false;
    if (koHash && boardHash(result.board) === koHash) return false;
    return true;
}

/**
 * Place a stone on the board. Returns the new game state.
 * @returns {{ board, captured, koHash, lastMove }} or null if invalid
 */
export function placeStone(board, r, c, color, prevBoardHash = null) {
    const result = tryPlaceStone(board, r, c, color);
    if (!result) return null;

    // Ko check: the new board must not match the previous board state
    const newHash = boardHash(result.board);
    if (prevBoardHash && newHash === prevBoardHash) return null;

    // Determine new ko hash (only if exactly 1 stone was captured and 
    // the placed stone has exactly 1 liberty — simple ko)
    let koHash = null;
    if (result.captured === 1) {
        const placedGroup = getGroup(result.board, r, c);
        if (placedGroup.stones.size === 1 && placedGroup.liberties.size === 1) {
            koHash = boardHash(board); // The previous state is now ko-forbidden
        }
    }

    return {
        board: result.board,
        captured: result.captured,
        koHash,
        lastMove: [r, c],
        capturedStones: result.capturedStones
    };
}

/**
 * Generate all legal move positions for a color
 * @returns {Array<{row, col}>}
 */
export function generateLegalMoves(board, color, koHash = null) {
    const size = board.length;
    const moves = [];
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (isValidMove(board, r, c, color, koHash)) {
                moves.push({ row: r, col: c });
            }
        }
    }
    return moves;
}

/**
 * Calculate territory and score using Chinese rules (area scoring)
 * @param {Array} board
 * @param {number} komi - compensation for white (default 7.5)
 * @returns {{ blackScore, whiteScore, blackTerritory, whiteTerritory, territoryMap }}
 */
export function calculateScore(board, komi = 7.5) {
    const size = board.length;
    const visited = Array.from({ length: size }, () => Array(size).fill(false));
    let blackStones = 0, whiteStones = 0;
    let blackTerritory = 0, whiteTerritory = 0;

    // Count stones
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (board[r][c] === 'B') blackStones++;
            else if (board[r][c] === 'W') whiteStones++;
        }
    }

    // territoryMap: 'B', 'W', 'N' (neutral/dame), '' (stone)
    const territoryMap = Array.from({ length: size }, () => Array(size).fill(''));

    // Flood fill empty regions to determine territory
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (board[r][c] !== '' || visited[r][c]) continue;

            // BFS to find connected empty region
            const region = [];
            const borders = new Set(); // colors of stones bordering this region
            const stack = [[r, c]];
            visited[r][c] = true;

            while (stack.length > 0) {
                const [cr, cc] = stack.pop();
                region.push([cr, cc]);

                for (const [dr, dc] of DIRS) {
                    const nr = cr + dr, nc = cc + dc;
                    if (!inBounds(nr, nc, size)) continue;
                    if (board[nr][nc] !== '') {
                        borders.add(board[nr][nc]);
                    } else if (!visited[nr][nc]) {
                        visited[nr][nc] = true;
                        stack.push([nr, nc]);
                    }
                }
            }

            // Territory belongs to a color only if bordered by exactly one color
            if (borders.size === 1) {
                const owner = [...borders][0];
                for (const [pr, pc] of region) {
                    territoryMap[pr][pc] = owner;
                }
                if (owner === 'B') blackTerritory += region.length;
                else whiteTerritory += region.length;
            } else {
                // Neutral (dame) or shared
                for (const [pr, pc] of region) {
                    territoryMap[pr][pc] = 'N';
                }
            }
        }
    }

    // Chinese rules: score = stones on board + territory
    const blackScore = blackStones + blackTerritory;
    const whiteScore = whiteStones + whiteTerritory + komi;

    return {
        blackScore,
        whiteScore,
        blackStones,
        whiteStones,
        blackTerritory,
        whiteTerritory,
        territoryMap,
        winner: blackScore > whiteScore ? 'B' : 'W'
    };
}

/**
 * Convert internal color 'B'/'W' to display color 'black'/'white'
 */
export function colorToDisplay(c) {
    return c === 'B' ? 'black' : 'white';
}

/**
 * Convert display color to internal
 */
export function displayToColor(c) {
    return c === 'black' ? 'B' : 'W';
}
