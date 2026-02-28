// ============ Go AI Engine ============
import {
    generateLegalMoves, tryPlaceStone, getGroup,
    opponentColor, cloneBoard, boardHash
} from './GoLogic.js';

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const DIAG_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

export const AI_MODELS = [
    { id: 'llama3.2:3b', name: 'Llama 3.2 3B', desc: '快速,較弱' },
    { id: 'llama3.1:8b', name: 'Llama 3.1 8B', desc: '平衡' },
    { id: 'mistral:7b', name: 'Mistral 7B', desc: '策略較強' },
    { id: 'qwen2.5:7b', name: 'Qwen 2.5 7B', desc: '中文較強' },
    { id: 'phi4-mini:3.8b', name: 'Phi-4 Mini', desc: '微軟模型' },
    { id: 'basic', name: '基本引擎', desc: '無 LLM, 最快' }
];

let selectedModel = 'phi4-mini:3.8b';

export function setAIModel(modelId) {
    if (modelId === 'basic') {
        selectedModel = null;
    } else {
        selectedModel = modelId;
    }
}

export function getSelectedModel() {
    return selectedModel;
}

function countStones(board, color) {
    let count = 0;
    for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board.length; c++) {
            if (board[r][c] === color) count++;
        }
    }
    return count;
}

function hasTwoLiberties(board, r, c, color) {
    const group = getGroup(board, r, c);
    return group.liberties.size >= 2;
}

function canCapture(board, r, c, color) {
    const opp = opponentColor(color);
    for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= board.length || nc < 0 || nc >= board.length) continue;
        if (board[nr][nc] === opp) {
            const group = getGroup(board, nr, nc);
            if (group.liberties.size === 1) return true;
        }
    }
    return false;
}

function isEyeLike(board, r, c, color) {
    let eyes = 0;
    let edges = 0;
    for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= board.length || nc < 0 || nc >= board.length) {
            edges++;
            continue;
        }
        if (board[nr][nc] === color) eyes++;
        else if (board[nr][nc] === '') return false;
    }
    return eyes >= 3 || edges === 4;
}

function evaluateMove(board, row, col, color) {
    const size = board.length;
    const opp = opponentColor(color);
    let score = 0;

    const result = tryPlaceStone(board, row, col, color);
    if (!result) return -Infinity;

    const stonesBefore = countStones(board, color);
    const stonesAfter = countStones(result.board, color);
    const captured = stonesAfter - stonesBefore;

    score += captured * 60;

    const group = getGroup(result.board, row, col);
    
    if (captured >= 2) score += captured * 20;

    if (group.liberties.size === 1 && captured === 0) {
        score -= 30;
    } else if (group.liberties.size === 2) {
        score -= 5;
    } else if (group.liberties.size >= 5) {
        score += 10;
    }

    for (const [dr, dc] of DIRS) {
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        
        if (result.board[nr][nc] === opp) {
            const oppGroup = getGroup(result.board, nr, nc);
            if (oppGroup.liberties.size === 1) score += 25;
            else if (oppGroup.liberties.size === 2) score += 8;
        }
        
        if (board[nr][nc] === color) {
            const beforeGroup = getGroup(board, nr, nc);
            if (beforeGroup.liberties.size === 1) {
                const afterGroup = getGroup(result.board, nr, nc);
                if (afterGroup.liberties.size > 1) score += 35;
            }
        }
    }

    let ownAdj = 0, oppAdj = 0, emptyAdj = 0;
    for (const [dr, dc] of DIRS) {
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (board[nr][nc] === color) ownAdj++;
        else if (board[nr][nc] === opp) oppAdj++;
        else emptyAdj++;
    }

    if (ownAdj >= 2) score += ownAdj * 3;
    if (oppAdj >= 2) score += oppAdj * 4;

    let diagOwn = 0;
    for (const [dr, dc] of DIAG_DIRS) {
        const nr = row + dr, nc = col + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === color) {
            diagOwn++;
        }
    }
    if (diagOwn >= 2) score += diagOwn * 2;

    const edgeDist = Math.min(row, col, size - 1 - row, size - 1 - col);
    if (edgeDist === 0) score -= 15;
    else if (edgeDist === 1) score -= 5;
    else if (edgeDist === 2) score += 5;
    else if (edgeDist === 3) score += 8;

    const center = (size - 1) / 2;
    const distFromCenter = Math.abs(row - center) + Math.abs(col - center);
    
    const totalStones = countStones(board, 'B') + countStones(board, 'W');
    const isOpening = totalStones < 10;
    const isEndgame = totalStones > size * size * 0.5;

    if (isOpening) {
        if (distFromCenter <= 4) score += 12 - distFromCenter * 2;
    } else if (isEndgame) {
        if (edgeDist >= 2) score += 10;
    } else {
        if (edgeDist >= 2 && edgeDist <= 4) score += 5;
    }

    if (isEyeLike(board, row, col, color)) score += 15;

    const cornerStarPoints = [[0,0], [0,size-1], [size-1,0], [size-1,size-1]];
    for (const [cr, cc] of cornerStarPoints) {
        if (Math.abs(row - cr) <= 1 && Math.abs(col - cc) <= 1) {
            score += 8;
        }
    }

    const starPoints19 = [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];
    const starPoints13 = [[3,3],[3,9],[6,6],[9,3],[9,9]];
    const starPoints9 = [[2,2],[2,6],[4,4],[6,2],[6,6]];
    const starPoints = size === 19 ? starPoints19 : size === 13 ? starPoints13 : starPoints9;
    for (const [sr, sc] of starPoints) {
        if (row === sr && col === sc) score += 10;
    }

    score += group.liberties.size * 3;

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

    const basicMove = getBasicAIMove(board, color, koHash);

    if (!selectedModel) {
        return basicMove;
    }

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
                model: selectedModel,
                messages: [{ role: 'user', content: prompt }],
                stream: false
            })
        });

        const data = await res.json();
        const reply = data.message?.content?.trim();
        if (reply) {
            console.log(`Ollama (${selectedModel}) suggested:`, reply);
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
