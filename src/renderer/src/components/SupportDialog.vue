<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import donationQr from '../assets/donation-qr.jpg'
import contactQr from '../assets/contact-qr.jpg'
const props = defineProps<{ mode?: 'donation' | 'feedback' }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
const donation = computed(() => props.mode === 'donation')
watch(
  () => props.mode,
  (mode) => {
    if (mode) dialog.value?.showModal()
    else dialog.value?.close()
  },
  { flush: 'post' }
)
function backdrop(event: MouseEvent): void {
  if (event.target !== dialog.value) return
  const bounds = dialog.value.getBoundingClientRect()
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  )
    emit('close')
}
</script>
<template>
  <dialog
    ref="dialog"
    class="support-dialog"
    aria-labelledby="support-title"
    aria-describedby="support-description"
    @cancel.prevent="$emit('close')"
    @click="backdrop"
  >
    <div class="support-heading">
      <h2 id="support-title">{{ donation ? '打赏支持' : '投诉建议' }}</h2>
      <button type="button" aria-label="关闭二维码" @click="$emit('close')">×</button>
    </div>
    <p id="support-description">
      {{
        donation
          ? '如果这个小工具帮到了你，欢迎随心打赏。'
          : '使用中遇到问题或有改进建议，欢迎扫码联系我。'
      }}
    </p>
    <div class="qr-frame">
      <img
        :src="donation ? donationQr : contactQr"
        :alt="donation ? '打赏二维码' : '个人微信二维码'"
      />
    </div>
    <p class="scan-hint">{{ donation ? '微信扫码 · 感谢你的支持' : '微信扫码 · 添加好友反馈' }}</p>
  </dialog>
</template>
<style scoped>
.support-dialog {
  width: min(304px, calc(100vw - 24px));
  max-height: calc(100dvh - 24px);
  overflow-y: auto;
  padding: 17px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface-raised);
  color: var(--text);
  box-shadow: 0 16px 60px #0008;
}
.support-dialog::backdrop {
  background: #101117b8;
}
.support-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.support-heading h2 {
  font-size: 15px;
  font-weight: 600;
}
.support-heading button {
  border: 0;
  background: transparent;
  color: var(--muted);
  border-radius: 5px;
  width: 26px;
  height: 26px;
  font-size: 22px;
  line-height: 1;
}
.support-heading button:hover {
  background: var(--hover);
  color: var(--text);
}
#support-description {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
  margin: 8px 0 15px;
}
.qr-frame {
  background: white;
  border-radius: 10px;
  padding: 10px;
}
.qr-frame img {
  display: block;
  width: 100%;
  height: auto;
}
.scan-hint {
  color: var(--accent);
  font-size: 11px;
  margin-top: 13px;
  text-align: center;
}
@media (max-height: 420px) {
  .qr-frame {
    max-width: 180px;
    margin: auto;
  }
  #support-description {
    margin-bottom: 10px;
  }
}
</style>
