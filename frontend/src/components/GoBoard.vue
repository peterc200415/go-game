<template>
  <div class="board-container">
    <svg :viewBox="`0 0 ${svgSize} ${svgSize}`" class="board-svg">
      <!-- Wood background -->
      <defs>
        <radialGradient id="boardGrad" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stop-color="#e8c96e" />
          <stop offset="100%" stop-color="#c9a043" />
        </radialGradient>
        <radialGradient id="blackStone" cx="35%" cy="35%" r="60%">
          <stop offset="0%" stop-color="#4a4a4a" />
          <stop offset="100%" stop-color="#1a1a1a" />
        </radialGradient>
        <radialGradient id="whiteStone" cx="35%" cy="35%" r="60%">
          <stop offset="0%" stop-color="#ffffff" />
          <stop offset="100%" stop-color="#d4d0c8" />
        </radialGradient>
        <filter id="stoneShadow">
          <feDropShadow dx="1" dy="2" stdDeviation="1.5" flood-opacity="0.35" />
        </filter>
      </defs>
      <rect x="0" y="0" :width="svgSize" :height="svgSize" fill="url(#boardGrad)" rx="4" />

      <!-- Grid lines -->
      <g :stroke="lineColor" stroke-width="1">
        <line v-for="i in boardSize" :key="'h'+i"
          :x1="padding" :y1="padding + (i-1) * cellSize"
          :x2="padding + (boardSize-1) * cellSize" :y2="padding + (i-1) * cellSize" />
        <line v-for="i in boardSize" :key="'v'+i"
          :x1="padding + (i-1) * cellSize" :y1="padding"
          :x2="padding + (i-1) * cellSize" :y2="padding + (boardSize-1) * cellSize" />
      </g>

      <!-- Star points (hoshi) -->
      <circle v-for="(pt, idx) in starPoints" :key="'star'+idx"
        :cx="padding + pt[1] * cellSize"
        :cy="padding + pt[0] * cellSize"
        :r="cellSize * 0.1"
        :fill="lineColor" />

      <!-- Hover indicator -->
      <circle v-if="hoverPos && canPlace"
        :cx="padding + hoverPos[1] * cellSize"
        :cy="padding + hoverPos[0] * cellSize"
        :r="stoneRadius * 0.85"
        :fill="myColor === 'black' ? 'rgba(26,26,26,0.35)' : 'rgba(245,240,232,0.45)'"
        stroke="rgba(59,130,246,0.5)" stroke-width="2" />

      <!-- Last move marker -->
      <rect v-if="lastMove"
        :x="padding + lastMove[1] * cellSize - cellSize * 0.15"
        :y="padding + lastMove[0] * cellSize - cellSize * 0.15"
        :width="cellSize * 0.3" :height="cellSize * 0.3"
        fill="rgba(239,68,68,0.8)" rx="2" />

      <!-- Stones -->
      <g v-for="(row, r) in board" :key="'row'+r">
        <g v-for="(cell, c) in row" :key="'cell'+r+'_'+c">
          <circle v-if="cell === 'B'"
            :cx="padding + c * cellSize" :cy="padding + r * cellSize"
            :r="stoneRadius" fill="url(#blackStone)" filter="url(#stoneShadow)" />
          <circle v-if="cell === 'W'"
            :cx="padding + c * cellSize" :cy="padding + r * cellSize"
            :r="stoneRadius" fill="url(#whiteStone)"
            stroke="#b0aaa0" stroke-width="0.5" filter="url(#stoneShadow)" />
        </g>
      </g>

      <!-- Clickable hitboxes (on top) -->
      <g v-for="(row, r) in board" :key="'hit'+r">
        <rect v-for="(cell, c) in row" :key="'h'+r+'_'+c"
          :x="padding + c * cellSize - cellSize/2"
          :y="padding + r * cellSize - cellSize/2"
          :width="cellSize" :height="cellSize"
          fill="transparent"
          style="cursor: pointer"
          @click="handleClick(r, c)"
          @mouseenter="onHover(r, c)"
          @mouseleave="hoverPos = null" />
      </g>
    </svg>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  board: { type: Array, required: true },
  boardSize: { type: Number, default: 19 },
  myColor: { type: String, default: 'black' },
  turn: { type: String, default: 'black' },
  lastMove: { type: Array, default: null },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['place']);

const hoverPos = ref(null);
const lineColor = '#2d2215';

const cellSize = computed(() => {
  if (props.boardSize <= 9) return 40;
  if (props.boardSize <= 13) return 32;
  return 26;
});
const padding = computed(() => cellSize.value * 1.2);
const svgSize = computed(() => padding.value * 2 + (props.boardSize - 1) * cellSize.value);
const stoneRadius = computed(() => cellSize.value * 0.44);

const canPlace = computed(() => {
  if (props.disabled) return false;
  if (!hoverPos.value) return false;
  const [r, c] = hoverPos.value;
  return props.board[r] && props.board[r][c] === '';
});

const starPoints = computed(() => {
  const s = props.boardSize;
  if (s === 19) {
    return [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];
  }
  if (s === 13) {
    return [[3,3],[3,9],[6,6],[9,3],[9,9]];
  }
  if (s === 9) {
    return [[2,2],[2,6],[4,4],[6,2],[6,6]];
  }
  return [];
});

function onHover(r, c) {
  if (!props.disabled && props.turn === props.myColor) {
    hoverPos.value = [r, c];
  }
}

function handleClick(r, c) {
  if (props.disabled) return;
  if (props.turn !== props.myColor) return;
  if (props.board[r][c] !== '') return;
  emit('place', { row: r, col: c });
  hoverPos.value = null;
}
</script>

<style scoped>
.board-container {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 15px 40px rgba(0,0,0,0.5);
  display: inline-block;
}
.board-svg {
  display: block;
  width: 100%;
  height: auto;
  max-width: 580px;
}
</style>
