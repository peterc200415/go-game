const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

class KataGoService {
    constructor({ enginePath, configPath, modelPath, presetPath }) {
        this.enginePath = enginePath;
        this.configPath = configPath;
        this.modelPath = modelPath;
        this.presetPath = presetPath;
        this.proc = null;
        this.rl = null;
        this.pending = new Map();
        this.nextId = 1;
        this.startPromise = null;
    }

    loadPresets() {
        return JSON.parse(fs.readFileSync(this.presetPath, 'utf-8'));
    }

    isInstalled() {
        return fs.existsSync(this.enginePath) && fs.existsSync(this.configPath) && fs.existsSync(this.modelPath);
    }

    async getHealth() {
        return {
            installed: this.isInstalled(),
            running: !!(this.proc && !this.proc.killed),
            enginePath: path.relative(process.cwd(), this.enginePath)
        };
    }

    async ensureStarted() {
        if (!this.isInstalled()) {
            const err = new Error('KataGo is not installed on the server');
            err.statusCode = 503;
            err.code = 'KATAGO_NOT_INSTALLED';
            throw err;
        }
        if (this.proc && !this.proc.killed) return;
        if (this.startPromise) return this.startPromise;

        fs.mkdirSync(path.join(path.dirname(this.configPath), 'logs'), { recursive: true });

        this.startPromise = new Promise((resolve, reject) => {
            const proc = spawn(this.enginePath, [
                'analysis',
                '-config', this.configPath,
                '-model', this.modelPath
            ], {
                cwd: path.dirname(this.enginePath),
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let settled = false;
            const startupTimer = setTimeout(() => {
                if (settled) return;
                settled = true;
                const err = new Error('KataGo startup timed out');
                err.statusCode = 504;
                err.code = 'KATAGO_STARTUP_TIMEOUT';
                reject(err);
            }, 10000);

            const resolveIfHealthy = () => {
                if (settled) return;
                if (!this.proc || this.proc.killed || this.proc.exitCode !== null) {
                    settled = true;
                    clearTimeout(startupTimer);
                    const err = new Error('KataGo exited during startup');
                    err.statusCode = 502;
                    err.code = 'KATAGO_STARTUP_FAILED';
                    reject(err);
                    return;
                }
                settled = true;
                clearTimeout(startupTimer);
                resolve();
            };

            this.proc = proc;
            this.rl = readline.createInterface({ input: proc.stdout });
            this.rl.on('line', (line) => this.handleLine(line));

            proc.stderr.on('data', (chunk) => {
                const text = chunk.toString().trim();
                if (text) console.error(`[KataGo] ${text}`);
            });

            proc.on('spawn', () => {
                setTimeout(resolveIfHealthy, 1500);

                // Ensure child process dies if parent dies
                const exitHandler = () => {
                    if (this.proc && !this.proc.killed) {
                        try { this.proc.kill('SIGKILL'); } catch (e) { }
                    }
                };
                process.on('exit', exitHandler);
                process.on('SIGINT', exitHandler);
                process.on('SIGTERM', exitHandler);
                process.on('SIGHUP', exitHandler);
                process.on('uncaughtException', exitHandler);
            });

            proc.on('error', (err) => {
                this.failAll(err);
                this.cleanupProcess();
                if (!settled) {
                    settled = true;
                    clearTimeout(startupTimer);
                    reject(err);
                }
            });

            proc.on('exit', (code, signal) => {
                this.failAll(new Error(`KataGo exited (code=${code}, signal=${signal || 'none'})`));
                this.cleanupProcess();
                if (!settled) {
                    settled = true;
                    clearTimeout(startupTimer);
                    const err = new Error(`KataGo exited during startup (code=${code}, signal=${signal || 'none'})`);
                    err.statusCode = 502;
                    err.code = 'KATAGO_STARTUP_FAILED';
                    reject(err);
                }
            });
        }).finally(() => {
            this.startPromise = null;
        });

        return this.startPromise;
    }

    cleanupProcess() {
        if (this.rl) {
            this.rl.removeAllListeners();
            this.rl.close();
            this.rl = null;
        }
        this.proc = null;
    }

    failAll(err) {
        for (const { reject, timer } of this.pending.values()) {
            clearTimeout(timer);
            reject(err);
        }
        this.pending.clear();
    }

    handleLine(line) {
        let payload;
        try {
            payload = JSON.parse(line);
        } catch {
            return;
        }
        if (!payload.id || !this.pending.has(payload.id)) return;
        const entry = this.pending.get(payload.id);
        clearTimeout(entry.timer);
        this.pending.delete(payload.id);
        entry.resolve(payload);
    }

    validateBoard(board) {
        if (!Array.isArray(board) || board.length === 0 || !board.every((row) => Array.isArray(row) && row.length === board.length)) {
            const err = new Error('Board must be a non-empty square matrix');
            err.statusCode = 400;
            err.code = 'INVALID_BOARD';
            throw err;
        }
        if (![9, 13, 19].includes(board.length)) {
            const err = new Error('KataGo presets only support 9x9, 13x13, or 19x19 boards');
            err.statusCode = 400;
            err.code = 'UNSUPPORTED_BOARD_SIZE';
            throw err;
        }
    }

    toGtp(row, col, size) {
        const letter = LETTERS[col];
        const number = size - row;
        return `${letter}${number}`;
    }

    fromGtp(coord, size) {
        if (!coord || coord.toLowerCase() === 'pass') return null;
        const upper = coord.toUpperCase();
        const col = LETTERS.indexOf(upper[0]);
        const row = size - parseInt(upper.slice(1), 10);
        if (col < 0 || Number.isNaN(row)) return null;
        return { row, col };
    }

    boardToInitialStones(board) {
        const size = board.length;
        const stones = [];
        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                const stone = board[row][col];
                if (stone === 'B' || stone === 'W') {
                    stones.push([stone, this.toGtp(row, col, size)]);
                }
            }
        }
        return stones;
    }

    getPreset(boardSize, difficulty) {
        const presets = this.loadPresets();
        const bySize = presets.board_sizes?.[String(boardSize)];
        const preset = bySize?.[difficulty];
        if (!preset) {
            const err = new Error(`No KataGo preset for ${boardSize}x${boardSize} ${difficulty}`);
            err.statusCode = 400;
            err.code = 'UNKNOWN_PRESET';
            throw err;
        }
        return preset;
    }

    async query(payload, timeoutMs) {
        await this.ensureStarted();
        if (!this.proc || this.proc.killed || this.proc.exitCode !== null) {
            const err = new Error('KataGo process is not running');
            err.statusCode = 502;
            err.code = 'KATAGO_NOT_RUNNING';
            throw err;
        }

        const id = `q${this.nextId++}`;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                const err = new Error('KataGo analysis timed out');
                err.statusCode = 504;
                err.code = 'KATAGO_TIMEOUT';
                reject(err);
            }, timeoutMs);

            this.pending.set(id, { resolve, reject, timer });
            this.proc.stdin.write(`${JSON.stringify({ ...payload, id })}\n`);
        });
    }

    async getMove({ board, color, boardSize, difficulty = 'hard', komi = 7.5 }) {
        this.validateBoard(board);
        if (boardSize && Number(boardSize) !== board.length) {
            const err = new Error('boardSize does not match board payload');
            err.statusCode = 400;
            err.code = 'BOARD_SIZE_MISMATCH';
            throw err;
        }
        if (!['B', 'W'].includes(color)) {
            const err = new Error('color must be B or W');
            err.statusCode = 400;
            err.code = 'INVALID_COLOR';
            throw err;
        }

        const preset = this.getPreset(board.length, difficulty);
        const response = await this.query({
            boardXSize: board.length,
            boardYSize: board.length,
            rules: 'chinese',
            komi,
            initialStones: this.boardToInitialStones(board),
            initialPlayer: color,
            moves: [],
            maxVisits: preset.max_visits,
            includePolicy: true
        }, Math.max(45000, Math.ceil(preset.time_per_move_sec * 1000) + 10000));

        const top = response.moveInfos?.[0];
        if (!top || !top.move) {
            const err = new Error('KataGo returned no move');
            err.statusCode = 502;
            err.code = 'KATAGO_EMPTY_MOVE';
            throw err;
        }

        if (top.move.toLowerCase() === 'pass') {
            return {
                engine: 'katago',
                difficulty,
                move: null,
                pass: true,
                info: {
                    visits: top.visits || preset.max_visits,
                    scoreLead: top.scoreLead ?? null,
                    winrate: top.winrate ?? null
                }
            };
        }

        const move = this.fromGtp(top.move, board.length);
        if (!move) {
            const err = new Error(`Unable to parse KataGo move: ${top.move}`);
            err.statusCode = 502;
            err.code = 'KATAGO_BAD_MOVE';
            throw err;
        }

        return {
            engine: 'katago',
            difficulty,
            move,
            pass: false,
            info: {
                visits: top.visits || preset.max_visits,
                scoreLead: top.scoreLead ?? null,
                winrate: top.winrate ?? null
            }
        };
    }

    async shutdown() {
        if (!this.proc || this.proc.killed) return;
        this.proc.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (this.proc && !this.proc.killed) {
            this.proc.kill('SIGKILL');
        }
        this.cleanupProcess();
    }
}

module.exports = KataGoService;
