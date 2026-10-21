<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElButton, ElInput, ElInputNumber, ElSwitch } from 'element-plus'
import type { AppState } from '../composables/useApp'
const props = defineProps<{ app: AppState }>()
const keyword = ref('')
const reply = ref('')
const test = ref('')
const error = ref('')
const expanded = ref(false)
const result = computed(() =>
  props.app.settings.replyRules.find(
    (r) => r.enabled && test.value.toLowerCase().includes(r.keyword.toLowerCase())
  )
)
async function add(): Promise<void> {
  error.value = ''
  if (!keyword.value.trim() || !reply.value.trim()) {
    error.value = '请填写关键词和回复内容'
    return
  }
  if (props.app.settings.replyRules.length >= 20) {
    error.value = '最多添加 20 条规则'
    return
  }
  if (
    await props.app.save({
      replyRules: [
        ...props.app.settings.replyRules,
        {
          id: crypto.randomUUID(),
          keyword: keyword.value.trim(),
          reply: reply.value.trim(),
          enabled: true
        }
      ]
    })
  ) {
    keyword.value = ''
    reply.value = ''
  }
}
</script>
<template>
  <div class="section-heading">自动回复</div>
  <div class="settings-card">
    <div class="setting-row">
      <div>
        <span>关键词自动回复</span>
        <p class="helper">使用当前直播页登录账号发送</p>
      </div>
      <ElSwitch
        :model-value="app.settings.autoReply"
        :disabled="app.saving.value || !app.settings.replyRules.some((r) => r.enabled)"
        aria-label="关键词自动回复"
        @change="app.save({ autoReply: Boolean($event) })"
      />
    </div>
    <button class="setting-row row-button" :aria-expanded="expanded" @click="expanded = !expanded">
      <span>回复规则</span
      ><span class="helper"
        >{{ app.settings.replyRules.length }}/20 · {{ expanded ? '收起' : '管理' }}</span
      >
    </button>
    <div v-if="expanded" class="reply-editor">
      <p class="helper">包含关键词即匹配，按列表顺序只回复第一条。</p>
      <div v-for="rule in app.settings.replyRules" :key="rule.id" class="reply-rule">
        <div class="reply-rule-head">
          <strong>{{ rule.keyword }}</strong
          ><ElSwitch
            :model-value="rule.enabled"
            :disabled="app.saving.value"
            :aria-label="`启用回复规则 ${rule.keyword}`"
            @change="
              app.save({
                replyRules: app.settings.replyRules.map((r) =>
                  r.id === rule.id ? { ...r, enabled: Boolean($event) } : r
                )
              })
            "
          />
        </div>
        <p>{{ rule.reply }}</p>
        <ElButton
          size="small"
          :disabled="app.saving.value"
          @click="app.save({ replyRules: app.settings.replyRules.filter((r) => r.id !== rule.id) })"
          >删除</ElButton
        >
      </div>
      <form class="reply-form" @submit.prevent="add">
        <ElInput
          v-model="keyword"
          maxlength="100"
          placeholder="关键词，例如：补货"
          aria-label="自动回复关键词"
        />
        <ElInput
          v-model="reply"
          maxlength="100"
          placeholder="回复，例如：明天下午补货，请关注直播间"
          aria-label="自动回复内容"
        />
        <ElButton native-type="submit" :disabled="app.saving.value" type="primary"
          >添加规则</ElButton
        >
      </form>
      <p v-if="error" class="field-error" role="alert">{{ error }}</p>
      <div class="section-heading">匹配测试</div>
      <ElInput
        v-model="test"
        placeholder="输入弹幕，仅测试，不发送"
        aria-label="自动回复匹配测试"
      />
      <p class="helper" aria-live="polite">
        {{
          test ? (result ? `预计回复：${result.reply}` : '未匹配规则') : '测试不会向直播间发送消息'
        }}
      </p>
    </div>
    <div class="setting-row">
      <span>回复间隔</span>
      <div class="input-with-unit">
        <ElInputNumber
          :model-value="app.settings.replyInterval"
          :disabled="app.saving.value"
          :min="5"
          :max="3600"
          :precision="0"
          size="small"
          controls-position="right"
          aria-label="自动回复间隔秒数"
          @change="app.save({ replyInterval: Number($event) })"
        /><span class="helper">秒</span>
      </div>
    </div>
    <div class="setting-row">
      <div>
        <span>同用户同关键词冷却</span>
        <p class="helper">重复命中直接跳过，0 为关闭</p>
      </div>
      <div class="input-with-unit">
        <ElInputNumber
          :model-value="app.settings.replyUserCooldown"
          :disabled="app.saving.value"
          :min="0"
          :max="3600"
          :precision="0"
          size="small"
          controls-position="right"
          aria-label="同用户同关键词冷却秒数"
          @change="app.save({ replyUserCooldown: Number($event) })"
        /><span class="helper">秒</span>
      </div>
    </div>
    <div class="setting-row">
      <span>每分钟回复上限</span>
      <div class="input-with-unit">
        <ElInputNumber
          :model-value="app.settings.replyMaxPerMinute"
          :disabled="app.saving.value"
          :min="1"
          :max="30"
          :precision="0"
          size="small"
          controls-position="right"
          aria-label="每分钟回复上限"
          @change="app.save({ replyMaxPerMinute: Number($event) })"
        /><span class="helper">条</span>
      </div>
    </div>
    <p v-if="app.bridge.value.replyIssue" class="field-error reply-status" role="alert">
      {{ app.bridge.value.replyIssue }}
    </p>
    <p class="helper reply-status" aria-live="polite">{{ app.replyStatus.value.detail }}</p>
  </div>
  <p class="helper section-note">
    命中后随机等待 1–10 秒再发送；回复间隔内跳过、不排队。已有草稿时暂停提交，演示模式不发送。
  </p>
</template>
<style scoped>
.reply-editor {
  padding: 0 14px 14px;
}
.reply-form {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}
.reply-rule {
  padding: 10px 0;
  border-bottom: 1px solid var(--border, #48494a);
}
.reply-rule-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.reply-rule p {
  margin: 5px 0 8px;
  overflow-wrap: anywhere;
  color: var(--text);
}
.reply-status {
  padding: 0 14px 12px;
  overflow-wrap: anywhere;
}
</style>
