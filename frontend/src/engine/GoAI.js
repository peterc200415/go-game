// ============ Go AI Engine ============
import {
    generateLegalMoves, tryPlaceStone, getGroup,
    opponentColor, cloneBoard, boardHash
} from './GoLogic.js';

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

/**
 * Evaluate a move's strategic value (higher = better)
 */
function evaluateMove(board, row, col, color) {
    const size = board.length;
    const opp = opponentColor(color);
    let score = 0;

    // 1. Capture bonus — strongly prefer moves that capture
    const result = tryPlaceStone(board, row, col, color);
    if (!result) return -Infinity;
    score += result.captured * 50;

    // 2. Atari threat — putting opponent groups in atari (1 liberty)
    for (const [dr, dc] of DIRS) {
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (result.board[nr][nc] === opp) {
            const group = getGroup(result.board, nr, nc);
            if (group.liberties.size === 1) score += 20;
            else if (group.liberties.size === 2) score += 5;
        }
    }

    // 3. Self-defense — save own groups in atari
    for (const [dr, dc] of DIRS) {
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (board[nr][nc] === color) {
            const groupBefore = getGroup(board, nr, nc);
            if (groupBefore.liberties.size === 1) {
                // This placement might save the group
                const groupAfter = getGroup(result.board, nr, nc);
                if (groupAfter.liberties.size > 1) score += 30;
            }
        }
    }

    // 4. Connectivity — prefer moves adjacent to own stones
    let ownAdj = 0, oppAdj = 0, emptyAdj = 0;
    for (const [dr, dc] of DIRS) {
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (board[nr][nc] === color) ownAdj++;
        else if (board[nr][nc] === opp) oppAdj++;
        else emptyAdj++;
    }
    score += ownAdj * 2 + emptyAdj * 1;

    // 5. Position bonus — prefer third/fourth line, avoid first line
    const distFromEdge = Math.min(row, col, size - 1 - row, size - 1 - col);
    if (distFromEdge === 0) score -= 8;
    else if (distFromEdge === 1) score -= 3;
    else if (distFromEdge === 2) score += 3;
    else if (distFromEdge === 3) score += 5;
    else if (distFromEdge === 4) score += 4;

    // 6. Center bonus (for opening)
    const center = (size - 1) / 2;
    const distFromCenter = Math.abs(row - center) + Math.abs(col - center);
    score += Math.max(0, 5 - distFromCenter * 0.3);

    // 7. Liberty count of the placed stone
    const placedGroup = getGroup(result.board, row, col);
    score += placedGroup.liberties.size * 2;

    // 8. Add small random factor to avoid predictability
    score += Math.random() * 3;

    return score;
}

/**
 * Basic strategic AI — evaluates each legal move and picks the best
 */
export function getBasicAIMove(board, color, koHash = null) {
    const moves = generateLegalMoves(board, color, koHash);
    if (moves.length === 0) return null;

    let bestMove = null;
    let bestScore = -Infinity;

    for (const move of moves) {
        const score = evaluateMove(board, move.row, move.col, color);
        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    }

    return bestMove;
}

/**
 * Get AI move via Ollama LLM with fallback to basic AI
 */
export async function getAIMove(board, color, koHash = null) {
    const moves = generateLegalMoves(board, color, koHash);
    if (moves.length === 0) return null;

    // Always compute basic AI move as fallback
    const basicMove = getBasicAIMove(board, color, koHash);

    // Try Ollama for strategic advice
    try {
        const size = board.length;
        let boardStr = '';
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c]) boardStr += `[${r},${c}]=${board[r][c] === 'B' ? 'Black' : 'White'} `;
            }
            boardStr += '\n';
        }

        const topMoves = moves.slice(0, 40).map(m => `(${m.row},${m.col})`).join(' ');
        const colorName = color === 'B' ? 'Black' : 'White';

        const prompt = `You are a strong Go (Weiqi) engine playing as ${colorName} on a ${size}x${size} board.\n` +
            `Board state (row,col):\n${boardStr}\n` +
            `Some legal moves: ${topMoves}\n\n` +
            `Pick the BEST strategic move. Consider territory, influence, and capturing.\n` +
            `Output ONLY two numbers: row,col\nExample: 3,4\nDo not explain.`;

        const isProxied = !window.location.port || window.location.port === '80' || window.location.port === '443';
        const apiBase = isProxied ? '' : `http://${window.location.hostname}:3001`;

        const res = await fetch(`${apiBase}/api/ai_move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3.1:8b',
                messages: [{ role: 'user', content: prompt }],
                stream: false
            })
        });

        const data = await res.json();
        const reply = data.message?.content?.trim();
        if (reply) {
            console.log('Ollama suggested:', reply);
            const match = reply.match(/(\d+)[^0-9]+(\d+)/);
            if (match) {
                const ollamaMove = { row: parseInt(match[1]), col: parseInt(match[2]) };
                const isLegal = moves.some(m => m.row === ollamaMove.row && m.col === ollamaMove.col);
                if (isLegal) {
                    console.log('Using Ollama move');
                    return ollamaMove;
                }
                console.warn('Ollama move was illegal, using basic AI');
            }
        }
    } catch (err) {
        console.warn('Ollama unavailable, using basic AI:', err.message);
    }

    return basicMove;
}
