<script setup lang="ts">
import type { ThemeId } from '../../../shared/types'
defineProps<{ modelValue: ThemeId; disabled: boolean }>()
defineEmits<{ change: [theme: ThemeId] }>()
const themes: { id: ThemeId; name: string; colors: string[] }[] = [
  { id: 'obsidian', name: '曜石黑', colors: ['#222329', '#a9d7fb', '#efbed7', '#e6b96b'] },
  { id: 'cream', name: '奶油白', colors: ['#faf7f0', '#c9dfef', '#efd1db', '#94692f'] },
  { id: 'sakura', name: '樱花粉', colors: ['#fff1f5', '#d1e0f5', '#edbad0', '#ab496e'] },
  { id: 'mint', name: '薄荷绿', colors: ['#eef7f3', '#c6dfed', '#edcbd9', '#287560'] },
  { id: 'mist', name: '雾霾蓝', colors: ['#202b3b', '#8bbde7', '#d4a9cc', '#91b8ef'] }
]
</script>
<template>
  <div class="section-heading first-heading">主题换肤</div>
  <div class="theme-grid" role="group" aria-label="主题换肤">
    <button
      v-for="theme in themes"
      :key="theme.id"
      type="button"
      class="theme-choice"
      :class="{ selected: modelValue === theme.id }"
      :aria-pressed="modelValue === theme.id"
      :disabled="disabled"
      @click="$emit('change', theme.id)"
    >
      <span class="theme-swatch" :style="{ background: theme.colors[0] }" aria-hidden="true"
        ><i v-for="color in theme.colors.slice(1)" :key="color" :style="{ background: color }"
      /></span>
      <span>{{ theme.name }}</span
      ><span v-if="modelValue === theme.id" class="theme-check" aria-hidden="true">✓</span>
    </button>
  </div>
</template>
<style scoped>
.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.theme-choice {
  position: relative;
  min-width: 0;
  border: 1px solid var(--line);
  padding: 6px 6px 8px;
  border-radius: 9px;
  background: var(--surface-raised);
  color: var(--muted);
  font-size: 11px;
  text-align: left;
}
.theme-choice.selected {
  border-color: var(--accent);
  color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.theme-choice:disabled {
  opacity: 0.6;
}
.theme-swatch {
  height: 35px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 7px;
  margin-bottom: 6px;
  border: 1px solid #80808020;
}
.theme-swatch i {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
}
.theme-check {
  position: absolute;
  right: 7px;
  bottom: 7px;
  font-size: 11px;
}
</style>
