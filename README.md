# Go Game Platform | 圍棋對戰平台

Online Go platform with real-time multiplayer, spectator mode, local heuristic AI, Ollama-based LLM AI, and CPU-only KataGo integration.

線上圍棋對戰平台，提供即時雙人對戰、觀戰、本地策略 AI、Ollama LLM AI，以及 CPU 版 KataGo 整合。

## Overview | 專案概覽

This project is a full-stack Go game platform built with Node.js, Socket.IO, Vue 3, and SQLite. It supports live rooms, spectators, game history, and multiple AI engines.

本專案是使用 Node.js、Socket.IO、Vue 3 與 SQLite 建置的全端圍棋平台，支援即時房間、觀戰、對局歷史與多種 AI 引擎。

## Features | 功能

- User registration and login
- Real-time online matches with Socket.IO
- Spectator mode
- Game history and replay data storage
- Server-side rule validation
- Chinese rules scoring with komi
- AI play modes:
  - Basic local heuristic AI
  - Ollama LLM AI
  - KataGo CPU integration for stronger play
- Bilingual UI support (Chinese / English)

- 使用者註冊與登入
- Socket.IO 即時線上對戰
- 觀戰模式
- 對局歷史與棋譜資料保存
- 伺服器端規則驗證
- 中國規則與貼目
- AI 對戰模式：
  - 本地 heuristic AI
  - Ollama LLM AI
  - CPU 版 KataGo 強化模式
- 中英文雙語支援

## Tech Stack | 技術棧

- Backend: Node.js, Express, Socket.IO, SQLite
- Frontend: Vue 3, Vite
- AI Engines:
  - KataGo analysis engine (CPU) [Primary / Default]
  - Basic heuristic engine
  - Ollama chat models
- Service management: `systemd --user`
- Reverse proxy: Nginx Proxy Manager

- 後端：Node.js、Express、Socket.IO、SQLite
- 前端：Vue 3、Vite
- AI 引擎：
  - KataGo analysis engine（CPU 版）[預設主力]
  - 本地 heuristic 引擎
  - Ollama 對話模型
- 服務管理：`systemd --user`
- 反向代理：Nginx Proxy Manager

## Repository Layout | 目錄結構

```text
/home/peterc20/opencode/go-game
├─ config/
├─ frontend/
├─ katago/
├─ routes/
├─ sockets/
├─ database.js
├─ server.js
└─ README.md
```

## Runtime Ports | 執行埠

| Service | Port | Description |
|---|---:|---|
| Backend API / Socket.IO | `3001` | Express + Socket.IO server |
| Frontend dev server | `5174` | Vite dev server |

| 服務 | 埠號 | 說明 |
|---|---:|---|
| 後端 API / Socket.IO | `3001` | Express + Socket.IO |
| 前端開發伺服器 | `5174` | Vite dev server |

## AI Modes | AI 模式

### 1. Basic AI

Local heuristic engine with lightweight tactical search. Suitable as the fastest fallback mode.

本地 heuristic 引擎，搭配淺層戰術搜尋，適合作為最快速的 fallback 模式。

### 2. Ollama LLM AI

Uses `/api/ai_move` to proxy chat-based move selection through Ollama. The backend enforces a timeout to avoid hanging requests.

透過 `/api/ai_move` 轉送到 Ollama 做落子判斷，後端已加 timeout，避免長時間卡死。

### 3. KataGo CPU AI (Default Player) / (預設 AI)

Uses `/api/katago/move` through a backend adapter that manages a persistent KataGo process. The system ensures robust process cleanup to prevent CPU leaks and uses extended timeouts (45s) to support deep AI vs AI thinking. Recommended for stronger play on 9x9 and 13x13 boards.

透過 `/api/katago/move` 呼叫 backend 的 KataGo adapter，由後端管理常駐 KataGo 行程，具備嚴謹的 Process 清理機制防止 CPU 資源洩漏，並支援 45 秒長考避免 Timeout，確保 AI 對戰 AI 也能順利運行。適合用在 9x9 與 13x13 的較強棋力模式。

Current presets for this host:

- `9x9`
  - `hard`: `0.5s / 100 visits`
  - `expert`: `1.0s / 200 visits`
- `13x13`
  - `hard`: `1.0s / 150 visits`
  - `expert`: `2.0s / 250 visits`
- `19x19`
  - `hard`: `2.5s / 200 visits`
  - `expert`: `4.0s / 350 visits`

本機目前的 KataGo 預設值：

- `9x9`
  - `hard`: `0.5s / 100 visits`
  - `expert`: `1.0s / 200 visits`
- `13x13`
  - `hard`: `1.0s / 150 visits`
  - `expert`: `2.0s / 250 visits`
- `19x19`
  - `hard`: `2.5s / 200 visits`
  - `expert`: `4.0s / 350 visits`

Preset file:

- [katago-presets.json](/home/peterc20/opencode/go-game/config/katago-presets.json)

## Quick Start | 快速開始

### Install Dependencies | 安裝依賴

```bash
npm install
cd frontend && npm install
```

### Start in Development | 開發模式啟動

```bash
# backend
npm start

# frontend
cd frontend && npm run dev
```

### Health Check | 健康檢查

```bash
curl http://127.0.0.1:3001/health
```

### AI Presets API | AI 預設 API

```bash
curl http://127.0.0.1:3001/api/ai/presets
```

## Production Service | 實際服務管理

This project is currently managed by `systemd --user`.

目前此專案透過 `systemd --user` 管理。

Service units:

- `go-game-backend.service`
- `go-game-frontend.service`

Common commands:

```bash
systemctl --user status go-game-backend.service
systemctl --user status go-game-frontend.service
systemctl --user restart go-game-backend.service
systemctl --user restart go-game-frontend.service
journalctl --user -u go-game-backend.service -n 100 --no-pager
```

常用指令：

```bash
systemctl --user status go-game-backend.service
systemctl --user status go-game-frontend.service
systemctl --user restart go-game-backend.service
systemctl --user restart go-game-frontend.service
journalctl --user -u go-game-backend.service -n 100 --no-pager
```

## Reverse Proxy | 反向代理

External traffic is exposed through Nginx Proxy Manager. For this deployment, the public host routes to the app and must allow WebSocket upgrade for `/socket.io`.

外部流量是透過 Nginx Proxy Manager 對外提供，目前部署必須確保 `/socket.io` 有正確的 WebSocket upgrade 代理。

Public host:

- `https://go.chao-huang.com`

## API Endpoints | API 端點

- `POST /api/auth/register` - Register | 註冊
- `POST /api/auth/login` - Login | 登入
- `GET /api/games/history` - Game history | 對局歷史
- `GET /api/games/:id` - Game detail | 對局內容
- `POST /api/ai_move` - Ollama AI move | Ollama AI 落子
- `POST /api/katago/move` - KataGo AI move | KataGo AI 落子
- `GET /api/ai/presets` - AI preset config | AI 預設設定
- `GET /health` - Service health | 健康檢查

## Rule Enforcement | 規則驗證

The server validates moves instead of trusting the frontend. It currently enforces:

- only players in the room may move
- correct turn order
- color ownership
- legal coordinates
- occupied-point rejection
- capture handling
- suicide prevention
- simple ko prevention
- spectator move rejection

伺服器端會驗證落子，而不是只相信前端。目前已驗證：

- 只有房內玩家可以下棋
- 輪到誰由 server 判定
- 顏色必須正確
- 座標必須合法
- 不可下在已有棋子的交叉點
- 提子處理
- 自殺禁手
- 簡單 ko 禁止
- spectator 不可注入落子

## Deployment Notes | 部署說明

- Socket.IO heartbeat has been tuned to reduce random disconnects.
- Backend includes timeout protection for Ollama requests.
- KataGo runs in CPU-only mode on this host as the default AI.
- AI vs AI mode natively supports KataGo vs KataGo with robust fallback logic and expanded timeouts.
- KataGo child processes are strictly tied to the Node.js lifecycle (preventing 100% CPU zombie leaks).

- Socket.IO heartbeat 已調整，降低隨機斷線。
- 後端已加入 Ollama timeout 保護。
- 目前 KataGo 在此主機上是 CPU-only 模式，且為全域預設 AI。
- AI 對戰 AI 模式現已完美支援 KataGo 互打，內建完善的讓步 (Pass) 邏輯與加長的運算寬容時間。
- KataGo 子程序已與 Node.js 生命週期綁定，解決當機或重啟時殘留殭屍程序導致 CPU 100% 的問題。

## Known Limitations | 已知限制

- CPU-only KataGo is strong enough for casual and mid-level play, but not ideal for fast 19x19 expert play.
- Cold start latency still exists immediately after backend restart.
- This repo currently runs the frontend as a Vite dev server rather than a static production build.

- CPU-only KataGo 對一般與中階對局已足夠，但不適合追求快速的 19x19 expert 模式。
- backend 剛重啟時仍存在 cold start 延遲。
- 目前前端仍是以 Vite dev server 方式運行，不是靜態 build 部署。

## License

MIT
