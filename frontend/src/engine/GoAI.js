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

function evaluateMove(board, row, col, color) {
    const size = board.length;
    const opp = opponentColor(color);
    let score = 0;

    const result = tryPlaceStone(board, row, col, color);
    if (!result) return -Infinity;

    const stonesBefore = countStones(board, color);
    const stonesAfter = countStones(result.board, color);
    const captured = stonesAfter - stonesBefore;

    score += captured * 100;

    if (captured > 0) {
        return score + Math.random();
    }

    const group = getGroup(result.board, row, col);
    
    if (group.liberties.size <= 1) {
        return -1000 + Math.random();
    }
    if (group.liberties.size === 2) {
        score -= 20;
    }

    for (const [dr, dc] of DIRS) {
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        
        if (result.board[nr][nc] === opp) {
            const oppGroup = getGroup(result.board, nr, nc);
            if (oppGroup.liberties.size === 1) {
                score += 80;
            } else if (oppGroup.liberties.size === 2) {
                score += 20;
            }
        }
        
        if (board[nr][nc] === color) {
            const beforeGroup = getGroup(board, nr, nc);
            if (beforeGroup.liberties.size === 1) {
                const afterGroup = getGroup(result.board, nr, nc);
                if (afterGroup.liberties.size > 1) {
                    score += 60;
                }
            } else {
                score += 5;
            }
        }
    }

    let ownStones = 0;
    let oppStones = 0;
    let empty = 0;
    for (const [dr, dc] of DIRS) {
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (board[nr][nc] === color) ownStones++;
        else if (board[nr][nc] === opp) oppStones++;
        else empty++;
    }

    score += ownStones * 10;
    score += oppStones * 8;
    score += empty * 2;

    let diagOwn = 0;
    for (const [dr, dc] of DIAG_DIRS) {
        const nr = row + dr, nc = col + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === color) {
            diagOwn++;
        }
    }
    score += diagOwn * 5;

    const edgeDist = Math.min(row, col, size - 1 - row, size - 1 - col);
    const totalStones = countStones(board, 'B') + countStones(board, 'W');
    
    if (totalStones < 20) {
        if (edgeDist === 0) score += 15;
        else if (edgeDist === 1) score += 20;
        else if (edgeDist === 2) score += 10;
        
        const starPoints19 = [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];
        const starPoints13 = [[3,3],[3,9],[6,6],[9,3],[9,9]];
        const starPoints9 = [[2,2],[2,6],[4,4],[6,2],[6,6]];
        const starPoints = size === 19 ? starPoints19 : size === 13 ? starPoints13 : starPoints9;
        
        for (const [sr, sc] of starPoints) {
            if (row === sr && col === sc) score += 25;
        }
    } else {
        if (edgeDist >= 2) score += 8;
        const center = (size - 1) / 2;
        const distCenter = Math.abs(row - center) + Math.abs(col - center);
        if (distCenter < 6) score += (6 - distCenter);
    }

    if (group.liberties.size >= 3) score += group.liberties.size * 3;

    return score + Math.random() * 2;
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
        const oppColor = color === 'B' ? 'W' : 'B';
        
        let boardStr = '';
        let blackStones = 0;
        let whiteStones = 0;
        
        for (let r = 0; r < size; r++) {
            let row = '';
            for (let c = 0; c < size; c++) {
                if (board[r][c] === 'B') {
                    row += 'X ';
                    blackStones++;
                } else if (board[r][c] === 'W') {
                    row += 'O ';
                    whiteStones++;
                } else {
                    row += '. ';
                }
            }
            boardStr += `${r}: ${row}\n`;
        }

        const topMoves = moves.slice(0, 24).map(m => `(${m.row},${m.col})`).join(', ');
        const playerColor = color === 'B' ? 'BLACK' : 'WHITE';
        const playerSymbol = color === 'B' ? 'X' : 'O';
        const turnNumber = blackStones + whiteStones + 1;
        
        const phase = turnNumber <= 20 ? 'opening' : turnNumber <= 80 ? 'middlegame' : 'endgame';

        const cornerInfo = [];
        const corners = [
            { name: 'top-left', coords: [[0,0], [0,1], [1,0], [1,1]] },
            { name: 'top-right', coords: [[0,size-1], [0,size-2], [1,size-1], [1,size-2]] },
            { name: 'bottom-left', coords: [[size-1,0], [size-2,0], [size-1,1], [size-2,1]] },
            { name: 'bottom-right', coords: [[size-1,size-1], [size-2,size-1], [size-1,size-2], [size-2,size-2]] }
        ];
        corners.forEach(corner => {
            const stones = corner.coords.map(([r,c]) => board[r]?.[c]).filter(Boolean);
            const bCount = stones.filter(s => s === 'B').length;
            const wCount = stones.filter(s => s === 'W').length;
            let status = 'open';
            if (bCount > wCount && bCount > 0) status = 'Black influence';
            else if (wCount > bCount && wCount > 0) status = 'White influence';
            else if (bCount === 0 && wCount === 0) status = 'empty';
            cornerInfo.push(`${corner.name}: ${status}`);
        });

        const prompt = `You are a 3-dan amateur Go (Weiqi) player. Current game state:

Board (${size}x${size}, ${phase}):
${boardStr}
You are playing as ${playerColor} (${playerSymbol}).
Total stones - Black: ${blackStones}, White: ${whiteStones}
Corner status:
${cornerInfo.join(', ')}

Legal moves (max 30): ${topMoves}

STRATEGY PRIORITIES:
${phase === 'opening' ? `OPENING FOCUS (turns 1-20):
- First secure corners: play on 4-4 (星位) or 3-4 (小目)
- Approach enemy corners with diagonal moves
- Avoid playing 3-3 unless invading
- Do NOT play on first line, prefer third/fourth line
- Build frameworks and reduce empty corners
- Ensure your stones have eye potential, avoid useless single stones
` : `GENERAL FOCUS:
- Capture opponent stones if possible (highest priority)
- If no capture, play Atari (threaten to capture)
- Extend your stones toward center and build territory
- Avoid playing on first line unless endgame
- Create eyes for life and defend weak groups
`}

STRICT OUTPUT RULE: only output the coordinates of your move in the format "row,col" (two integers separated by a comma). Absolutely no extra text, no explanation, no intro/outro, no Chinese characters.
Example: 3,4`;

        const isProxied = !window.location.port || window.location.port === '80' || window.location.port === '443';
        const apiBase = isProxied ? '' : `http://${window.location.hostname}:3001`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(`${apiBase}/api/ai_move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: selectedModel,
                messages: [{ role: 'user', content: prompt }],
                stream: false,
                options: {
                    temperature: 0.05,
                    top_p: 0.85,
                    num_predict: 30
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
                const row = parseInt(match[1]);
                const col = parseInt(match[2]);
                const ollamaMove = { row, col };
                const isLegal = moves.some(m => m.row === row && m.col === col);
                if (isLegal && row >= 0 && row < size && col >= 0 && col < size) {
                    console.log('Using Ollama move:', ollamaMove);
                    return ollamaMove;
                }
                console.warn('Ollama move not legal, using basic AI');
            }
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            console.warn('Ollama timeout, using basic AI');
        } else {
            console.warn('Ollama error:', err.message);
        }
    }

    return basicMove;
}
