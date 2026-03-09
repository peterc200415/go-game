// ============ Go AI Engine ============
import {
    generateLegalMoves, tryPlaceStone, getGroup,
    opponentColor, boardHash
} from './GoLogic.js';

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const DIAG_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const SEARCH_WIDTH = 10;
const SEARCH_DEPTH = 2;

export const AI_MODELS = [
    { id: 'katago-hard', name: 'KataGo Hard', desc: 'CPU KataGo with lower time cap' },
    { id: 'katago-expert', name: 'KataGo Expert', desc: 'CPU KataGo with stronger search' },
    { id: 'llama3.2:3b', name: 'Llama 3.2 3B', desc: 'Fast small LLM' },
    { id: 'llama3.1:8b', name: 'Llama 3.1 8B', desc: 'Balanced general model' },
    { id: 'mistral:7b', name: 'Mistral 7B', desc: 'Solid tactical play' },
    { id: 'qwen2.5:7b', name: 'Qwen 2.5 7B', desc: 'Good reasoning model' },
    { id: 'phi4-mini:3.8b', name: 'Phi-4 Mini', desc: 'Current default LLM' },
    { id: 'basic', name: 'Basic AI', desc: 'Local heuristic engine, no LLM' }
];

let selectedModel = 'katago-hard';

export function setAIModel(modelId) {
    selectedModel = modelId === 'basic' ? null : modelId;
}

export function getSelectedModel() {
    return selectedModel;
}

function getApiBase() {
    const isProxied = !window.location.port || window.location.port === '80' || window.location.port === '443';
    return isProxied ? '' : `http://${window.location.hostname}:3001`;
}

function boardStats(board) {
    let black = 0;
    let white = 0;
    for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board.length; c++) {
            if (board[r][c] === 'B') black++;
            else if (board[r][c] === 'W') white++;
        }
    }
    return { black, white, total: black + white };
}

function starPoints(size) {
    if (size === 19) return [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]];
    if (size === 13) return [[3, 3], [3, 9], [6, 6], [9, 3], [9, 9]];
    return [[2, 2], [2, 6], [4, 4], [6, 2], [6, 6]];
}

function countNeighbors(board, row, col, color) {
    let direct = 0;
    let diagonal = 0;
    for (const [dr, dc] of DIRS) {
        const nr = row + dr;
        const nc = col + dc;
        if (board[nr]?.[nc] === color) direct++;
    }
    for (const [dr, dc] of DIAG_DIRS) {
        const nr = row + dr;
        const nc = col + dc;
        if (board[nr]?.[nc] === color) diagonal++;
    }
    return { direct, diagonal };
}

function estimateTerritory(board, color) {
    const size = board.length;
    let score = 0;
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (board[r][c] !== '') continue;
            let own = 0;
            let opp = 0;
            for (const [dr, dc] of [...DIRS, ...DIAG_DIRS]) {
                const nr = r + dr;
                const nc = c + dc;
                if (!board[nr]?.[nc]) continue;
                if (board[nr][nc] === color) own++;
                else opp++;
            }
            if (own > opp) score += 1;
            else if (opp > own) score -= 1;
        }
    }
    return score;
}

function evaluateBoard(board, color) {
    const stats = boardStats(board);
    let score = (color === 'B' ? stats.black - stats.white : stats.white - stats.black) * 12;
    const visited = new Set();

    for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board.length; c++) {
            const stone = board[r][c];
            if (!stone) continue;
            const key = `${r},${c}`;
            if (visited.has(key)) continue;
            const group = getGroup(board, r, c);
            for (const groupKey of group.stones) visited.add(groupKey);

            const liberties = group.liberties.size;
            const groupValue = group.stones.size * 9;
            const libertyValue = liberties * liberties * 2;
            const sign = stone === color ? 1 : -1;
            score += sign * (groupValue + libertyValue);

            if (liberties === 1) score -= sign * 45;
            if (liberties === 2) score -= sign * 12;
            if (group.stones.size >= 4 && liberties >= 3) score += sign * 18;
        }
    }

    score += estimateTerritory(board, color) * 3;
    return score;
}

function movePositionalScore(board, row, col, color, result) {
    const size = board.length;
    const opp = opponentColor(color);
    const stats = boardStats(board);
    let score = 0;
    const group = getGroup(result.board, row, col);
    const { direct: ownDirect, diagonal: ownDiag } = countNeighbors(board, row, col, color);
    const { direct: oppDirect } = countNeighbors(board, row, col, opp);
    const edgeDist = Math.min(row, col, size - 1 - row, size - 1 - col);
    const center = (size - 1) / 2;
    const centerDist = Math.abs(row - center) + Math.abs(col - center);

    score += result.captured * 110;
    score += ownDirect * 16 + ownDiag * 6;
    score += oppDirect * 10;
    score += group.liberties.size * 7;

    if (group.liberties.size <= 1) score -= 200;
    else if (group.liberties.size === 2) score -= 35;

    for (const [dr, dc] of DIRS) {
        const nr = row + dr;
        const nc = col + dc;
        if (!result.board[nr]?.[nc] || result.board[nr][nc] !== opp) continue;
        const oppGroup = getGroup(result.board, nr, nc);
        if (oppGroup.liberties.size === 1) score += 60;
        else if (oppGroup.liberties.size === 2) score += 18;
    }

    if (stats.total < size + 10) {
        for (const [sr, sc] of starPoints(size)) {
            if (row === sr && col === sc) score += 28;
        }
        if (edgeDist === 0) score -= 18;
        else if (edgeDist === 1) score += 14;
        else if (edgeDist === 2 || edgeDist === 3) score += 8;
        score -= centerDist * 0.7;
    } else {
        score += Math.max(0, 6 - centerDist);
        if (edgeDist === 0) score -= 8;
    }

    return score;
}

function evaluateMove(board, row, col, color, koHash = null) {
    const result = tryPlaceStone(board, row, col, color);
    if (!result) return -Infinity;
    if (koHash && boardHash(result.board) === koHash) return -Infinity;
    return evaluateBoard(result.board, color) + movePositionalScore(board, row, col, color, result);
}

function rankMoves(board, color, koHash = null, width = SEARCH_WIDTH) {
    const moves = generateLegalMoves(board, color, koHash);
    return moves
        .map(move => ({ move, score: evaluateMove(board, move.row, move.col, color, koHash) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, width);
}

function minimax(board, color, currentColor, depth, koHash = null, alpha = -Infinity, beta = Infinity) {
    if (depth === 0) return evaluateBoard(board, color);

    const ranked = rankMoves(board, currentColor, koHash, SEARCH_WIDTH);
    if (ranked.length === 0) return evaluateBoard(board, color);

    const maximizing = currentColor === color;
    let best = maximizing ? -Infinity : Infinity;

    for (const { move } of ranked) {
        const result = tryPlaceStone(board, move.row, move.col, currentColor);
        if (!result) continue;
        const nextKoHash = result.captured === 1 ? boardHash(board) : null;
        const value = minimax(result.board, color, opponentColor(currentColor), depth - 1, nextKoHash, alpha, beta);

        if (maximizing) {
            best = Math.max(best, value);
            alpha = Math.max(alpha, best);
        } else {
            best = Math.min(best, value);
            beta = Math.min(beta, best);
        }
        if (beta <= alpha) break;
    }

    return best;
}

export function getBasicAIMove(board, color, koHash = null) {
    const ranked = rankMoves(board, color, koHash, SEARCH_WIDTH);
    if (ranked.length === 0) return null;

    let bestMove = ranked[0].move;
    let bestScore = -Infinity;

    for (const { move, score: localScore } of ranked) {
        const result = tryPlaceStone(board, move.row, move.col, color);
        if (!result) continue;
        const nextKoHash = result.captured === 1 ? boardHash(board) : null;
        const searchScore = minimax(result.board, color, opponentColor(color), SEARCH_DEPTH - 1, nextKoHash);
        const finalScore = localScore * 0.65 + searchScore * 0.35;
        if (finalScore > bestScore) {
            bestScore = finalScore;
            bestMove = move;
        }
    }

    return bestMove;
}

async function getKataGoMove(board, color) {
    const difficulty = selectedModel === 'katago-expert' ? 'expert' : 'hard';
    const res = await fetch(`${getApiBase()}/api/katago/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            board,
            color,
            boardSize: board.length,
            difficulty
        })
    });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `KataGo request failed (${res.status})`);
    }

    const data = await res.json();
    return data.move ?? null;
}

export async function getAIMove(board, color, koHash = null) {
    const moves = generateLegalMoves(board, color, koHash);
    if (moves.length === 0) return null;

    const basicMove = getBasicAIMove(board, color, koHash);

    if (!selectedModel) {
        return basicMove;
    }

    if (selectedModel.startsWith('katago-')) {
        try {
            const move = await getKataGoMove(board, color);
            if (!move) return null;
            const isLegal = moves.some(candidate => candidate.row === move.row && candidate.col === move.col);
            if (isLegal) return move;
            console.warn('KataGo returned an illegal move, using basic AI');
        } catch (err) {
            console.warn('KataGo error:', err.message);
        }
        return basicMove;
    }

    try {
        const size = board.length;
        const stats = boardStats(board);

        let boardStr = '';
        for (let r = 0; r < size; r++) {
            let row = '';
            for (let c = 0; c < size; c++) {
                if (board[r][c] === 'B') row += 'X ';
                else if (board[r][c] === 'W') row += 'O ';
                else row += '. ';
            }
            boardStr += `${r}: ${row}\n`;
        }

        const rankedMoves = rankMoves(board, color, koHash, 12);
        const topMoves = rankedMoves
            .map(({ move, score }) => `(${move.row},${move.col}) score=${score.toFixed(1)}`)
            .join(', ');
        const playerColor = color === 'B' ? 'BLACK' : 'WHITE';
        const playerSymbol = color === 'B' ? 'X' : 'O';
        const turnNumber = stats.total + 1;
        const phase = turnNumber <= 20 ? 'opening' : turnNumber <= 120 ? 'middlegame' : 'endgame';

        const prompt = `You are a strong Go (Weiqi) player. Choose the best move from the candidate list only.\n\nBoard (${size}x${size}, ${phase}):\n${boardStr}You are ${playerColor} (${playerSymbol}). Turn ${turnNumber}.\nCandidate legal moves: ${topMoves}\n\nPriorities:\n1. Save groups in atari or capture enemy groups in atari.\n2. Prefer moves that strengthen shape, gain liberties, or attack weak enemy groups.\n3. In opening, value corners and sides before small center moves.\n4. Avoid self-atari and pointless dame.\n\nSTRICT OUTPUT: only "row,col".`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(`${getApiBase()}/api/ai_move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: selectedModel,
                messages: [{ role: 'user', content: prompt }],
                stream: false,
                options: {
                    temperature: 0.05,
                    top_p: 0.85,
                    num_predict: 20
                }
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await res.json();
        const reply = data.message?.content?.trim();
        if (reply) {
            console.log(`Ollama (${selectedModel}) said:`, reply);
            const match = reply.match(/(\d+)[,\s]+(\d+)/);
            if (match) {
                const row = parseInt(match[1], 10);
                const col = parseInt(match[2], 10);
                const ollamaMove = { row, col };
                const isLegal = moves.some(move => move.row === row && move.col === col);
                if (isLegal && row >= 0 && row < size && col >= 0 && col < size) {
                    return ollamaMove;
                }
                console.warn('Ollama move not legal, using basic AI');
            }
        }
    } catch (err) {
        if (err.name === 'AbortError') console.warn('Ollama timeout, using basic AI');
        else console.warn('Ollama error:', err.message);
    }

    return basicMove;
}
