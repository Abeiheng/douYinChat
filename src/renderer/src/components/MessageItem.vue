<script setup lang="ts">
import { ref, watch } from 'vue'
import { Present } from '@element-plus/icons-vue'
import type { DisplayEvent } from '../core/pipeline'
const props = defineProps<{ message: DisplayEvent }>()
defineEmits<{ reply: [message: DisplayEvent, event: MouseEvent] }>()
const avatarFailed = ref(false)
watch(
  () => props.message.avatar,
  () => {
    avatarFailed.value = false
  }
)
</script>
<template>
  <div
    class="message-item user-message"
    :class="[
      { 'gift-message': message.type === 'gift', 'host-message': message.isHost },
      `bubble-${message.gender || 'unknown'}`
    ]"
    :data-host="message.isHost || undefined"
    :data-gender="message.gender || 'unknown'"
    :title="new Date(message.receivedAt).toLocaleTimeString('zh-CN')"
    @contextmenu="
      message.type === 'danmaku' && ($event.preventDefault(), $emit('reply', message, $event))
    "
  >
    <img
      v-if="message.avatar && !avatarFailed"
      class="message-avatar"
      :src="message.avatar"
      :alt="`${message.nickname}的头像`"
      referrerpolicy="no-referrer"
      @error="avatarFailed = true"
    />
    <span v-else class="message-avatar avatar-placeholder" aria-hidden="true">{{
      message.nickname.slice(0, 1)
    }}</span>
    <div class="message-content">
      <span class="nickname">{{ message.nickname }}</span
      ><span class="colon">：</span>
      <span v-if="message.type === 'danmaku'" class="message-body">{{ message.text }}</span>
      <span v-else class="gift-body">
        <Present class="gift-icon" /><span class="gift-action">送出 </span
        ><span class="gift-name">{{ message.giftName }}</span
        ><span class="gift-count"> ×{{ message.quantity }}</span>
      </span>
    </div>
  </div>
</template>
<style scoped>
.user-message {
  --user-accent: #aab2c1;
  --row-tint: transparent;
  display: flex;
  align-items: center;
  gap: 10px;
  width: fit-content;
  max-width: 100%;
  margin: 5px 0;
  padding: 8px 10px;
  border-radius: 14px;
  background: var(--row-tint);
  color: var(--text);
  line-height: 1.7;
}
.host-message {
  margin-left: auto;
  flex-direction: row-reverse;
}
.bubble-male {
  --user-accent: var(--male-text);
  --row-tint: var(--male-bg);
}
.bubble-female {
  --user-accent: var(--female-text);
  --row-tint: var(--female-bg);
}
.bubble-unknown {
  --user-accent: var(--unknown-text);
  --row-tint: var(--unknown-bg);
  box-shadow: inset 0 0 0 1px var(--line);
}
.bubble-unknown .message-avatar {
  border-color: var(--unknown-text);
  box-shadow: none;
}
.bubble-unknown .avatar-placeholder {
  background: var(--unknown-bg);
}
.message-avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  align-self: flex-start;
  object-fit: cover;
  border-radius: 50%;
  border: 2px solid var(--user-accent);
  box-shadow: 0 0 0 2px #1c1e2233;
}
.avatar-placeholder {
  display: grid;
  place-items: center;
  background: var(--surface-raised);
  font-size: 14px;
  color: var(--user-accent);
}
.message-content {
  min-width: 0;
  flex: 0 1 auto;
  overflow-wrap: anywhere;
  font-weight: 500;
  text-shadow: 0 1px 1px var(--text-shadow);
}
.nickname {
  color: var(--user-accent);
  font-size: inherit;
  font-weight: 600;
  line-height: inherit;
  vertical-align: bottom;
}
.message-content .colon {
  color: var(--user-accent);
  opacity: 0.8;
  margin-right: 3px;
}
.message-body,
.gift-body {
  margin: 0;
  line-height: inherit;
  overflow-wrap: anywhere;
}
.gift-body {
  display: inline-flex;
  vertical-align: middle;
  align-items: center;
  flex-wrap: wrap;
  gap: 3px;
}
</style>
