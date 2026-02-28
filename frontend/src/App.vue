<template>
  <div class="app-container">
    <!-- Language Toggle -->
    <button class="lang-toggle" @click="toggleLang">{{ lang === 'zh' ? 'EN' : '中' }}</button>

    <!-- ============ LOBBY ============ -->
    <div v-if="view === 'lobby'" class="glass-panel lobby">
      <h1>⚫ {{ t('title') }}</h1>

      <!-- Auth (not logged in) -->
      <div v-if="!user" class="auth-box flex-col">
        <h3>{{ t('loginOrRegister') }}</h3>
        <input v-model="email" :placeholder="t('email')" />
        <input v-model="password" type="password" :placeholder="t('password')" />
        <input v-model="nickname" :placeholder="t('nickname')" />
        <div style="display:flex; gap: 10px">
          <button @click="login">{{ t('login') }}</button>
          <button @click="register">{{ t('register') }}</button>
        </div>
        <hr style="width:100%; border-color: rgba(255,255,255,0.1)" />
        <div class="flex-col">
          <label style="color: var(--text-secondary); font-size: 13px; text-align: center">{{ t('boardSizeLabel') }}</label>
          <div class="size-selector">
            <button :class="['size-btn', selectedSize === 9 && 'active']" @click="selectedSize = 9">9×9</button>
            <button :class="['size-btn', selectedSize === 13 && 'active']" @click="selectedSize = 13">13×13</button>
            <button :class="['size-btn', selectedSize === 19 && 'active']" @click="selectedSize = 19">19×19</button>
          </div>
          <label style="color: var(--text-secondary); font-size: 13px; text-align: center; margin-top: 8px">{{ t('aiModel') }}</label>
          <select v-model="selectedModel" @change="onModelChange" style="padding: 6px; border-radius: 6px; background: #1e1e2e; color: #fff; border: 1px solid #444; margin-bottom: 8px">
            <option v-for="m in AI_MODELS" :key="m.id" :value="m.id" style="background: #1e1e2e; color: #fff">{{ m.name }} ({{ m.desc }})</option>
          </select>
          <button @click="startSP" style="background: var(--accent-green)">{{ t('playAI') }}</button>
          <button @click="startAIAI" style="background: var(--accent-purple); margin-top: 8px">{{ t('playAIAI') }}</button>
        </div>

        <!-- AI vs AI Model Selection (Guest) -->
        <div v-if="showAIAISelector" class="flex-col" style="margin-top: 12px; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px">
          <label style="color: var(--text-secondary); font-size: 13px; text-align: center">{{ t('aiVsAiModels') }}</label>
          <div style="display: flex; gap: 8px; margin: 8px 0">
            <select v-model="aiModelBlack" style="flex:1; padding: 6px; border-radius: 6px; background: #1e1e2e; color: #e2e8f0; border: 1px solid #444">
              <option v-for="m in AI_MODELS" :key="m.id" :value="m.id" style="background: #1e1e2e; color: #fff">{{ m.name }}</option>
            </select>
            <span style="align-self: center">⚫ vs ⚪</span>
            <select v-model="aiModelWhite" style="flex:1; padding: 6px; border-radius: 6px; background: #1e1e2e; color: #94a3b8; border: 1px solid #444">
              <option v-for="m in AI_MODELS" :key="m.id" :value="m.id" style="background: #1e1e2e; color: #fff">{{ m.name }}</option>
            </select>
          </div>
          <button @click="confirmAIAI" style="background: var(--accent-purple)">{{ t('startAIAI') }}</button>
        </div>
      </div>

      <!-- Logged in -->
      <div v-else class="room-box flex-col">
        <h3>{{ t('welcome') }}, {{ user.nickname }}!</h3>
        <input v-model="roomIdInput" :placeholder="t('roomId')" />
        <div style="display:flex; gap: 10px">
          <button @click="joinRoom" style="flex:1">{{ t('joinRoom') }}</button>
          <button @click="createRoom" style="flex:1; background: var(--accent-purple)">{{ t('newRoom') }}</button>
        </div>

        <div class="flex-col">
          <label style="color: var(--text-secondary); font-size: 13px; text-align: center">{{ t('boardSizeLabel') }}</label>
          <div class="size-selector">
            <button :class="['size-btn', selectedSize === 9 && 'active']" @click="selectedSize = 9">9×9</button>
            <button :class="['size-btn', selectedSize === 13 && 'active']" @click="selectedSize = 13">13×13</button>
            <button :class="['size-btn', selectedSize === 19 && 'active']" @click="selectedSize = 19">19×19</button>
          </div>
          <label style="color: var(--text-secondary); font-size: 13px; text-align: center; margin-top: 8px">{{ t('aiModel') }}</label>
          <select v-model="selectedModel" @change="onModelChange" style="padding: 6px; border-radius: 6px; background: #1e1e2e; color: #fff; border: 1px solid #444; margin-bottom: 8px">
            <option v-for="m in AI_MODELS" :key="m.id" :value="m.id" style="background: #1e1e2e; color: #fff">{{ m.name }} ({{ m.desc }})</option>
          </select>
          <button @click="startSP" style="background: var(--accent-green)">{{ t('playAI') }}</button>
          <button @click="startAIAI" style="background: var(--accent-purple); margin-top: 8px">{{ t('playAIAI') }}</button>
        </div>

        <!-- AI vs AI Model Selection -->
        <div v-if="showAIAISelector" class="flex-col" style="margin-top: 12px; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px">
          <label style="color: var(--text-secondary); font-size: 13px; text-align: center">{{ t('aiVsAiModels') }}</label>
          <div style="display: flex; gap: 8px; margin: 8px 0">
            <select v-model="aiModelBlack" style="flex:1; padding: 6px; border-radius: 6px; background: #1e1e2e; color: #e2e8f0; border: 1px solid #444">
              <option v-for="m in AI_MODELS" :key="m.id" :value="m.id" style="background: #1e1e2e; color: #fff">{{ m.name }}</option>
            </select>
            <span style="align-self: center">⚫ vs ⚪</span>
            <select v-model="aiModelWhite" style="flex:1; padding: 6px; border-radius: 6px; background: #1e1e2e; color: #94a3b8; border: 1px solid #444">
              <option v-for="m in AI_MODELS" :key="m.id" :value="m.id" style="background: #1e1e2e; color: #fff">{{ m.name }}</option>
            </select>
          </div>
          <button @click="confirmAIAI" style="background: var(--accent-purple)">{{ t('startAIAI') }}</button>
        </div>

        <!-- Room List -->
        <div v-if="rooms.length > 0" class="room-list">
          <h4 style="margin: 12px 0 8px; color: var(--text-secondary)">{{ t('availableRooms') }}</h4>
          <div v-for="room in rooms" :key="room.id" class="room-card">
            <div class="room-card-info">
              <span class="room-card-id">{{ room.id }}</span>
              <span :class="['room-status', room.status]">
                {{ room.status === 'waiting' ? t('waiting') : t('playing') }}
              </span>
            </div>
            <div class="room-card-players">
              <span v-for="p in room.players" :key="p.nickname"
                :style="{color: p.color === 'black' ? '#e2e8f0' : '#94a3b8'}">
                {{ p.color === 'black' ? '⚫' : '⚪' }} {{ p.nickname }}
              </span>
              <span v-if="room.spectatorCount > 0" style="color: var(--text-muted)">👁 {{ room.spectatorCount }}</span>
            </div>
            <div style="display:flex; gap: 8px; margin-top: 8px">
              <button v-if="room.playerCount < 2" @click="joinRoomById(room.id)"
                style="flex:1; font-size:13px; padding:6px">{{ t('joinRoom') }}</button>
              <button @click="watchRoom(room.id)"
                style="flex:1; font-size:13px; padding:6px; background: #6366f1">👁 {{ t('watch') }}</button>
            </div>
          </div>
        </div>
        <div v-else style="color: var(--text-muted); text-align: center; margin: 12px 0; font-size: 14px">
          {{ t('noRooms') }}
        </div>

        <button @click="startSP" style="background: var(--accent-green); margin-top:8px">{{ t('playAI') }}</button>
      </div>
    </div>

    <!-- ============ WAITING ROOM ============ -->
    <div v-else-if="view === 'waiting'" class="glass-panel lobby" style="text-align: center">
      <h2>{{ t('waitingTitle') }}</h2>
      <p style="color: var(--text-secondary)">
        {{ t('roomId') }}: <strong style="color: var(--accent-amber); font-size: 20px; user-select: all">{{ currentRoomId }}</strong>
      </p>
      <p style="color: var(--text-secondary)">{{ t('waitingMsg') }}</p>
      <p style="color: var(--text-muted); font-size: 13px">{{ t('boardSizeLabel') }}: {{ boardSize }}×{{ boardSize }}</p>
      <div class="spinner"></div>
      <button @click="leaveWaiting" style="margin-top: 20px">{{ t('cancel') }}</button>
    </div>

    <!-- ============ GAME VIEW ============ -->
    <div v-else-if="view === 'game'" class="game-view flex-col" style="align-items: center">
      <div class="game-header glass-panel" style="width: 100%">
        <h2 v-if="isSpectator">👁 {{ t('spectating') }} — {{ currentRoomId }}</h2>
        <h2 v-else-if="isAIAI">{{ t('playAIAI') }}: {{ aiModelBlack }} ⚫ vs ⚪ {{ aiModelWhite }}</h2>
        <h2 v-else>{{ isSinglePlayer ? t('singlePlayer') : t('room') + ': ' + currentRoomId }}</h2>

        <div class="game-info-bar">
          <span>{{ t('turnLabel') }}:
            <strong :style="{color: turn === 'black' ? '#e2e8f0' : '#94a3b8'}">
              {{ turn === 'black' ? '⚫' : '⚪' }} {{ colorName(turn) }}
            </strong>
            <span v-if="isAIAI" style="font-size: 11px; margin-left: 4px">({{ turn === 'black' ? aiModelBlack : aiModelWhite }})</span>
          </span>
          <span v-if="!isSpectator && !isAIAI">{{ t('color') }}:
            <strong>{{ myColor === 'black' ? '⚫' : '⚪' }} {{ colorName(myColor) }}</strong>
          </span>
          <span>{{ t('captures') }}:
            ⚫ {{ capturedByBlack }} / ⚪ {{ capturedByWhite }}
          </span>
          <span>{{ t('moveNum') }}: {{ moveCount }}</span>
          <span>{{ t('boardSizeLabel') }}: 
            <select v-model.number="boardSize" @change="onBoardSizeChange" :disabled="(!isSinglePlayer && !isAIAI) || moveCount > 0" style="background: transparent; color: inherit; border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 6px">
              <option :value="9">9×9</option>
              <option :value="13">13×13</option>
              <option :value="19">19×19</option>
            </select>
          </span>
        </div>

        <div v-if="isSpectator" style="color: #6366f1; margin-top: 4px; font-size: 13px">
          {{ t('spectatorHint') }}
        </div>

        <div class="game-actions">
          <button v-if="!isSpectator && !gameOver" @click="pass"
            style="background: var(--accent-amber)">{{ t('pass') }}</button>
          <button v-if="!isSpectator && !gameOver" @click="resign"
            style="background: var(--accent-red)">{{ t('resign') }}</button>
          <button @click="leave">{{ t('leaveGame') }}</button>
          <span style="display: inline-block; width: 140px; text-align: right; font-size: 13px">
            <span v-if="aiThinking" style="color: var(--accent-amber)">
              🤔 {{ t('aiThinking') }}
            </span>
          </span>
          <span style="font-size: 13px">{{ t('zoom') }}:
            <button @click="boardScale = Math.max(0.5, boardScale - 0.1)" style="padding: 2px 6px; margin: 0 4px">−</button>
            {{ Math.round(boardScale * 100) }}%
            <button @click="boardScale = Math.min(2, boardScale + 0.1)" style="padding: 2px 6px; margin: 0 4px">+</button>
          </span>
        </div>
      </div>

      <GoBoard
        :board="board"
        :boardSize="boardSize"
        :turn="turn"
        :myColor="myColor"
        :lastMove="lastMove"
        :scale="boardScale"
        :disabled="isSpectator || gameOver || aiThinking || turn !== myColor"
        @place="handlePlace"
        style="margin-top: 16px"
      />

      <!-- Score / Victory Overlay -->
      <div v-if="gameOver" class="victory-overlay" @click.self="closeVictory">
        <div class="victory-modal">
          <div class="victory-icon">{{ resultIcon }}</div>
          <h1 class="victory-title">{{ resultTitle }}</h1>
          <p v-if="scoreResult" class="victory-sub">
            ⚫ {{ t('black') }}: {{ scoreResult.blackScore }} / ⚪ {{ t('white') }}: {{ scoreResult.whiteScore }}
          </p>
          <p class="victory-sub">{{ winMessage }}</p>
          <button @click="closeVictory" class="victory-btn">{{ t('backToLobby') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { io } from 'socket.io-client';
import GoBoard from './components/GoBoard.vue';
import {
  createBoard, placeStone, boardHash,
  calculateScore, displayToColor, colorToDisplay
} from './engine/GoLogic.js';
import { getAIMove, AI_MODELS, setAIModel, getSelectedModel } from './engine/GoAI.js';

// ==================== i18n ====================
const lang = ref('zh');

const i18n = {
  zh: {
    title: '圍棋對戰平台',
    loginOrRegister: '登入或註冊',
    email: '電子郵件',
    password: '密碼',
    nickname: '暱稱（僅註冊時需要）',
    login: '登入',
    register: '註冊',
    playAI: '單機對戰 AI',
    playAIAI: 'AI 對戰 AI',
    aiVsAiModels: '選擇 AI 模型 (黑棋 vs 白棋)',
    startAIAI: '開始對戰',
    welcome: '歡迎',
    roomId: '房間 ID',
    joinRoom: '加入房間',
    newRoom: '建立新房間',
    singlePlayer: '單機對戰 AI',
    room: '房間',
    color: '持棋',
    turnLabel: '輪到',
    black: '黑方',
    white: '白方',
    aiThinking: 'AI 思考中...',
    leaveGame: '離開遊戲',
    pass: '虛手 (Pass)',
    resign: '認輸',
    victory: '勝利！',
    defeat: '敗北',
    backToLobby: '返回大廳',
    waitingTitle: '等待對手加入...',
    waitingMsg: '請將上方房間 ID 分享給對手，對手加入後遊戲將自動開始！',
    cancel: '取消',
    registerSuccess: '註冊成功！請登入。',
    gameSaved: '對局結束並已儲存！',
    needLogin: '請先登入或註冊帳號！',
    enterRoomId: '請輸入房間 ID！',
    availableRooms: '可用房間',
    waiting: '等待中',
    playing: '對戰中',
    noRooms: '目前沒有房間，建立一個吧！',
    watch: '觀戰',
    spectating: '觀戰中',
    spectatorHint: '你正在觀看此對局，無法落子',
    captures: '提子',
    moveNum: '手數',
    boardSizeLabel: '棋盤大小',
    aiModel: 'AI 模型',
    zoom: '縮放',
    gameEndScore: '雙方虛手，終局計分',
    resignWin: (c) => `${c}認輸`,
    scoreWin: (winner, diff) => `${winner}勝 ${diff.toFixed(1)} 目`,
    draw: '和棋',
  },
  en: {
    title: 'Go Game Online',
    loginOrRegister: 'Login or Register',
    email: 'Email',
    password: 'Password',
    nickname: 'Nickname (register only)',
    login: 'Login',
    register: 'Register',
    playAI: 'Play vs AI',
    playAIAI: 'AI vs AI',
    aiVsAiModels: 'Select AI Models (Black vs White)',
    startAIAI: 'Start Match',
    welcome: 'Welcome',
    roomId: 'Room ID',
    joinRoom: 'Join Room',
    newRoom: 'New Room',
    singlePlayer: 'Single Player vs AI',
    room: 'Room',
    color: 'Color',
    turnLabel: 'Turn',
    black: 'Black',
    white: 'White',
    aiThinking: 'AI is thinking...',
    leaveGame: 'Leave Game',
    pass: 'Pass',
    resign: 'Resign',
    victory: 'Victory!',
    defeat: 'Defeat',
    backToLobby: 'Back to Lobby',
    waitingTitle: 'Waiting for opponent...',
    waitingMsg: 'Share the Room ID above with your opponent. Game starts when they join!',
    cancel: 'Cancel',
    registerSuccess: 'Registered! Please login.',
    gameSaved: 'Game ended and saved!',
    needLogin: 'Please login or register first!',
    enterRoomId: 'Please enter a Room ID!',
    availableRooms: 'Available Rooms',
    waiting: 'Waiting',
    playing: 'Playing',
    noRooms: 'No rooms yet. Create one!',
    watch: 'Watch',
    spectating: 'Spectating',
    spectatorHint: 'You are watching this game. You cannot place stones.',
    captures: 'Captures',
    moveNum: 'Move',
    boardSizeLabel: 'Board Size',
    aiModel: 'AI Model',
    zoom: 'Zoom',
    gameEndScore: 'Both players passed. Scoring...',
    resignWin: (c) => `${c} resigned`,
    scoreWin: (winner, diff) => `${winner} wins by ${diff.toFixed(1)} points`,
    draw: 'Draw',
  }
};

function t(key) { return i18n[lang.value][key]; }
function colorName(c) { return c === 'black' ? t('black') : t('white'); }
function toggleLang() { lang.value = lang.value === 'zh' ? 'en' : 'zh'; }

// ==================== State ====================
const isProxied = !window.location.port || window.location.port === '80' || window.location.port === '443';
const API = isProxied ? '' : `http://${window.location.hostname}:3001`;
const SOCKET_URL = isProxied ? window.location.origin : `http://${window.location.hostname}:3001`;
let socket;

const view = ref('lobby');
const user = ref(null);
const email = ref('');
const password = ref('');
const nickname = ref('');
const roomIdInput = ref('');
const selectedSize = ref(19);
const selectedModel = ref('phi4-mini:3.8b');
const showAIAISelector = ref(false);
const aiModelBlack = ref('phi4-mini:3.8b');
const aiModelWhite = ref('llama3.1:8b');
const isAIAI = ref(false);

const board = ref([]);
const boardSize = ref(19);
const boardScale = ref(1);
const turn = ref('black');
const myColor = ref('black');
const isSinglePlayer = ref(false);
const currentRoomId = ref('');
const lastMove = ref(null);
const gameOver = ref(false);
const scoreResult = ref(null);
const winMessage = ref('');
const resultTitle = ref('');
const resultIcon = ref('🏆');
const aiThinking = ref(false);
const rooms = ref([]);
const isSpectator = ref(false);
const moveCount = ref(0);
const capturedByBlack = ref(0);
const capturedByWhite = ref(0);
const consecutivePasses = ref(0);
const koHash = ref(null);

function closeVictory() {
  gameOver.value = false;
  scoreResult.value = null;
  winMessage.value = '';
  view.value = 'lobby';
}

function onModelChange() {
  setAIModel(selectedModel.value);
}

function onBoardSizeChange() {
  if ((isSinglePlayer.value || isAIAI.value) && moveCount.value === 0) {
    board.value = createBoard(boardSize.value);
    turn.value = 'black';
    lastMove.value = null;
    moveCount.value = 0;
    capturedByBlack.value = 0;
    capturedByWhite.value = 0;
    consecutivePasses.value = 0;
    koHash.value = null;
    koHash.value = null;
  }
}

function resetBoard() {
  boardSize.value = selectedSize.value;
  board.value = createBoard(boardSize.value);
  turn.value = 'black';
  lastMove.value = null;
  moveCount.value = 0;
  capturedByBlack.value = 0;
  capturedByWhite.value = 0;
  consecutivePasses.value = 0;
  koHash.value = null;
  koHash.value = null;
  gameOver.value = false;
  scoreResult.value = null;
}

// ==================== Auth ====================
async function login() {
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, password: password.value })
    });
    const data = await res.json();
    if (data.token) {
      user.value = data.user;
      initSocket();
    } else alert(data.error);
  } catch (e) { alert('Server connection failed'); }
}

async function register() {
  try {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, password: password.value, nickname: nickname.value })
    });
    const data = await res.json();
    if (data.message) alert(t('registerSuccess'));
    else alert(data.error);
  } catch (e) { alert('Server connection failed'); }
}

// ==================== Socket ====================
function initSocket() {
  if (socket) return;
  socket = io(SOCKET_URL);

  socket.on('connect', () => console.log('Socket connected:', socket.id));

  socket.on('game_start', (data) => {
    boardSize.value = data.boardSize || 19;
    selectedSize.value = boardSize.value;
    resetBoard();
    const me = data.players.find(p => p.id === user.value.id);
    if (me) myColor.value = me.color;
    view.value = 'game';
  });

  socket.on('move_made', (move) => {
    if (move.type === 'pass') {
      consecutivePasses.value++;
      turn.value = turn.value === 'black' ? 'white' : 'black';
      moveCount.value++;
      if (consecutivePasses.value >= 2) endGameByScore();
      return;
    }

    const color = displayToColor(move.color);
    const result = placeStone(board.value, move.row, move.col, color, koHash.value);
    if (result) {
      board.value = result.board;
      if (move.color === 'black') capturedByBlack.value += result.captured;
      else capturedByWhite.value += result.captured;
      lastMove.value = result.lastMove;
      koHash.value = result.koHash;
      turn.value = turn.value === 'black' ? 'white' : 'black';
      moveCount.value++;
      consecutivePasses.value = 0;
    }
  });

  socket.on('game_saved', () => {
    alert(t('gameSaved'));
    view.value = 'lobby';
  });

  socket.on('room_update', (room) => console.log('Room update:', room));
  socket.on('player_disconnected', () => {
    alert(t('gameSaved'));
    view.value = 'lobby';
  });

  socket.on('room_list', (list) => { rooms.value = list; });

  socket.on('watch_start', (data) => {
    boardSize.value = data.boardSize || 19;
    selectedSize.value = boardSize.value;
    resetBoard();
    // Replay all moves
    for (const move of data.moves) {
      if (move.type === 'pass') {
        turn.value = turn.value === 'black' ? 'white' : 'black';
        moveCount.value++;
        continue;
      }
      const color = displayToColor(move.color);
      const result = placeStone(board.value, move.row, move.col, color, koHash.value);
      if (result) {
        board.value = result.board;
        lastMove.value = result.lastMove;
        koHash.value = result.koHash;
        turn.value = turn.value === 'black' ? 'white' : 'black';
        moveCount.value++;
      }
    }
    isSpectator.value = true;
    myColor.value = 'black';
    view.value = 'game';
  });
}

// ==================== Room Management ====================
function createRoom() {
  if (!user.value) { alert(t('needLogin')); return; }
  const id = Math.random().toString(36).substring(2, 8);
  currentRoomId.value = id;
  if (!socket) initSocket();
  socket.emit('join_room', { roomId: id, user: user.value, boardSize: selectedSize.value });
  view.value = 'waiting';
}

function joinRoom() {
  if (!user.value) { alert(t('needLogin')); return; }
  if (!roomIdInput.value.trim()) { alert(t('enterRoomId')); return; }
  joinRoomById(roomIdInput.value.trim());
}

function joinRoomById(id) {
  if (!user.value) { alert(t('needLogin')); return; }
  currentRoomId.value = id;
  if (!socket) initSocket();
  socket.emit('join_room', { roomId: id, user: user.value, boardSize: selectedSize.value });
  view.value = 'waiting';
}

function leaveWaiting() {
  if (socket && currentRoomId.value) socket.emit('leave_room', currentRoomId.value);
  currentRoomId.value = '';
  view.value = 'lobby';
}

function watchRoom(roomId) {
  currentRoomId.value = roomId;
  isSinglePlayer.value = false;
  isSpectator.value = true;
  if (!socket) initSocket();
  socket.emit('watch_room', { roomId });
}

// ==================== Game Play ====================
function startSP() {
  if (!user.value) { alert(t('needLogin')); return; }
  isSinglePlayer.value = true;
  isAIAI.value = false;
  isSpectator.value = false;
  currentRoomId.value = '';
  myColor.value = 'black';
  resetBoard();
  view.value = 'game';
}

function startAIAI() {
  if (!user.value) { alert(t('needLogin')); return; }
  showAIAISelector.value = !showAIAISelector.value;
}

function confirmAIAI() {
  if (!user.value) { alert(t('needLogin')); return; }
  isSinglePlayer.value = false;
  isAIAI.value = true;
  isSpectator.value = false;
  currentRoomId.value = '';
  myColor.value = 'black';
  resetBoard();
  view.value = 'game';
  makeAIMove();
}

async function makeAIMove() {
  if (gameOver.value || !isAIAI.value) return;
  
  const currentModel = turn.value === 'black' ? aiModelBlack.value : aiModelWhite.value;
  setAIModel(currentModel);
  
  const aiColor = turn.value === 'black' ? 'B' : 'W';
  
  aiThinking.value = true;
  setTimeout(async () => {
    const move = await getAIMove(board.value, aiColor, koHash.value);
    aiThinking.value = false;
    
    if (!move) {
      consecutivePasses.value++;
      turn.value = turn.value === 'black' ? 'white' : 'black';
      moveCount.value++;
      if (consecutivePasses.value >= 2) {
        endGameByScore();
        return;
      }
    } else {
      const color = aiColor;
      const result = placeStone(board.value, move.row, move.col, color, koHash.value);
      if (result) {
        board.value = result.board;
        if (aiColor === 'B') capturedByBlack.value += result.captured;
        else capturedByWhite.value += result.captured;
        lastMove.value = result.lastMove;
        koHash.value = result.koHash;
        turn.value = turn.value === 'black' ? 'white' : 'black';
        moveCount.value++;
        consecutivePasses.value = 0;
      }
    }
    
    if (!gameOver.value) {
      setTimeout(makeAIMove, 500);
    }
  }, 300);
}

async function handlePlace({ row, col }) {
  if (isSpectator.value || gameOver.value) return;
  if (turn.value !== myColor.value) return;

  const color = displayToColor(myColor.value);
  const result = placeStone(board.value, row, col, color, koHash.value);
  if (!result) return;

  board.value = result.board;
  if (myColor.value === 'black') capturedByBlack.value += result.captured;
  else capturedByWhite.value += result.captured;
  lastMove.value = result.lastMove;
  koHash.value = result.koHash;
  turn.value = turn.value === 'black' ? 'white' : 'black';
  moveCount.value++;
  consecutivePasses.value = 0;

  if (!isSinglePlayer.value) {
    socket.emit('make_move', {
      roomId: currentRoomId.value,
      move: { row, col, color: myColor.value, type: 'stone' }
    });
  } else {
    // AI turn
    aiThinking.value = true;
    setTimeout(async () => {
      const aiColor = myColor.value === 'black' ? 'W' : 'B';
      const aiDisplayColor = myColor.value === 'black' ? 'white' : 'black';
      const aiMove = await getAIMove(board.value, aiColor, koHash.value);
      aiThinking.value = false;

      if (!aiMove) {
        // AI passes
        consecutivePasses.value++;
        turn.value = myColor.value;
        moveCount.value++;
        if (consecutivePasses.value >= 2) endGameByScore();
        return;
      }

      const aiResult = placeStone(board.value, aiMove.row, aiMove.col, aiColor, koHash.value);
      if (aiResult) {
        board.value = aiResult.board;
        if (aiDisplayColor === 'black') capturedByBlack.value += aiResult.captured;
        else capturedByWhite.value += aiResult.captured;
        lastMove.value = aiResult.lastMove;
        koHash.value = aiResult.koHash;
        turn.value = myColor.value;
        moveCount.value++;
        consecutivePasses.value = 0;
      } else {
        // AI can't place — pass
        consecutivePasses.value++;
        turn.value = myColor.value;
        moveCount.value++;
        if (consecutivePasses.value >= 2) endGameByScore();
      }
    }, 200);
  }
}

function pass() {
  if (isSpectator.value || gameOver.value) return;
  if (turn.value !== myColor.value) return;

  consecutivePasses.value++;
  turn.value = turn.value === 'black' ? 'white' : 'black';
  moveCount.value++;

  if (!isSinglePlayer.value) {
    socket.emit('make_move', {
      roomId: currentRoomId.value,
      move: { type: 'pass', color: myColor.value }
    });
  }

  if (consecutivePasses.value >= 2) {
    endGameByScore();
    return;
  }

  // AI turn after pass
  if (isSinglePlayer.value) {
    aiThinking.value = true;
    setTimeout(async () => {
      const aiColor = myColor.value === 'black' ? 'W' : 'B';
      const aiDisplayColor = myColor.value === 'black' ? 'white' : 'black';
      const aiMove = await getAIMove(board.value, aiColor, koHash.value);
      aiThinking.value = false;

      if (!aiMove) {
        consecutivePasses.value++;
        turn.value = myColor.value;
        moveCount.value++;
        if (consecutivePasses.value >= 2) endGameByScore();
        return;
      }

      const aiResult = placeStone(board.value, aiMove.row, aiMove.col, aiColor, koHash.value);
      if (aiResult) {
        board.value = aiResult.board;
        if (aiDisplayColor === 'black') capturedByBlack.value += aiResult.captured;
        else capturedByWhite.value += aiResult.captured;
        lastMove.value = aiResult.lastMove;
        koHash.value = aiResult.koHash;
        turn.value = myColor.value;
        moveCount.value++;
        consecutivePasses.value = 0;
      }
    }, 200);
  }
}

function resign() {
  if (isSpectator.value || gameOver.value) return;
  const winner = myColor.value === 'black' ? 'white' : 'black';
  gameOver.value = true;
  resultIcon.value = myColor.value === winner ? '🏆' : '😔';
  resultTitle.value = t('defeat');
  winMessage.value = t('resignWin')(colorName(myColor.value));

  if (!isSinglePlayer.value) {
    socket.emit('game_end', { roomId: currentRoomId.value, winner });
  }
}

function endGameByScore() {
  const komi = 7.5;
  const result = calculateScore(board.value, komi);
  scoreResult.value = result;
  gameOver.value = true;

  const winnerDisplay = colorToDisplay(result.winner);
  const diff = Math.abs(result.blackScore - result.whiteScore);
  resultIcon.value = winnerDisplay === myColor.value ? '🏆' : '😔';
  resultTitle.value = winnerDisplay === myColor.value ? t('victory') : t('defeat');
  winMessage.value = t('scoreWin')(colorName(winnerDisplay), diff);

  if (!isSinglePlayer.value) {
    socket.emit('game_end', { roomId: currentRoomId.value, winner: winnerDisplay });
  }
}

function leave() {
  isSpectator.value = false;
  gameOver.value = false;
  if (!isSinglePlayer.value && socket) {
    socket.emit('leave_room', currentRoomId.value);
  }
  view.value = 'lobby';
}

</script>
