# Go Game Platform (圍棋對戰平台)

線上圍棋對戰平台，支持雙人對戰、單機對戰 AI、觀戰功能。

## 功能 Features

- 用戶註冊/登入
- 雙人線上對戰 (Socket.IO)
- 單機對戰 AI (基本策略 + Ollama LLM)
- 觀戰功能
- 完整圍棋規則 (提子、打劫、中國規則計分)
- 中英文雙語支持

## 技術棧

- **後端**: Node.js + Express + Socket.IO + SQLite
- **前端**: Vue 3 + Vite
- **AI**: 基本策略引擎 + Ollama LLM

## 快速開始

### 安裝依賴

```bash
# 安裝後端依賴
npm install

# 安裝前端依賴
cd frontend && npm install
```

### 啟動服務

```bash
# 啟動後端 (port 3001)
npm start

# 啟動前端 (port 5174)
cd frontend && npm run dev
```

### 生產構建

```bash
cd frontend && npm run build
```

## 服務配置

| 服務 | 端口 |
|------|------|
| 後端 API | 3001 |
| 前端開發 | 5174 |

## 系統服務 (systemd)

```bash
# 開機自啟
systemctl --user enable go-game-backend go-game-frontend

# 查看狀態
systemctl --user status go-game-backend go-game-frontend

# 重啟服務
systemctl --user restart go-game-backend go-game-frontend
```

## API 端點

- `POST /api/auth/register` - 註冊
- `POST /api/auth/login` - 登入
- `GET /api/games/history` - 對局歷史
- `GET /api/games/:id` - 獲取對局
- `POST /api/ai_move` - AI 落子 (Proxy to Ollama)
- `GET /health` - 健康檢查

## 遊戲規則

- 標準圍棋棋盤 (9×9, 13×13, 19×19)
- 中國規則計分 (黑棋 7.5 目貼目)
- 支持打劫判断
- 虛手 (Pass) 終局

##  License

MIT
