<script setup lang="ts">
import { ref } from 'vue'
import { ElButton, ElInput, ElSwitch } from 'element-plus'
import type { AppState } from '../composables/useApp'
const props = defineProps<{ app: AppState }>()
const word = ref('')
const error = ref('')
const ownName = ref(props.app.settings.selfNickname)
const expanded = ref(false)
async function addWord(): Promise<void> {
  const text = word.value.trim()
  if (!text) return
  error.value = ''
  if (props.app.settings.filterWords.some((w) => w.toLowerCase() === text.toLowerCase())) {
    error.value = '该过滤词已存在'
    return
  }
  if (await props.app.save({ filterWords: [...props.app.settings.filterWords, text] }))
    word.value = ''
}
async function saveName(): Promise<void> {
  if (!(await props.app.save({ selfNickname: ownName.value.trim() })))
    ownName.value = props.app.settings.selfNickname
}
</script>
<template>
  <div class="section-heading">消息过滤</div>
  <div class="settings-card filter-card">
    <div class="setting-row">
      <div>
        <span>隐藏自己的消息</span>
        <p class="helper">按下方昵称识别，同名用户也会隐藏</p>
      </div>
      <ElSwitch
        :model-value="app.settings.hideSelf"
        :disabled="app.saving.value || !app.settings.selfNickname"
        aria-label="隐藏自己的消息"
        @change="app.save({ hideSelf: Boolean($event) })"
      />
    </div>
    <div class="own-name">
      <ElInput
        v-model="ownName"
        maxlength="200"
        placeholder="填写当前登录抖音账号的昵称"
        aria-label="我的抖音昵称"
        @change="saveName"
        @keydown.enter.prevent="saveName"
      />
    </div>
    <div class="filter-editor">
      <p class="helper">包含过滤词的消息不显示，也不触发自动回复。</p>
      <form @submit.prevent="addWord">
        <ElInput
          v-model="word"
          maxlength="100"
          placeholder="添加过滤词"
          aria-label="过滤词"
        /><ElButton
          native-type="submit"
          :disabled="app.saving.value || !word.trim() || app.settings.filterWords.length >= 50"
          >添加</ElButton
        >
      </form>
      <p v-if="error" class="field-error">{{ error }}</p>
      <div class="filter-tags">
        <span v-for="(text, index) in app.settings.filterWords" :key="text"
          >{{ text
          }}<button
            type="button"
            :aria-label="`删除过滤词 ${text}`"
            :disabled="app.saving.value"
            @click="
              app.save({ filterWords: app.settings.filterWords.filter((_, i) => i !== index) })
            "
          >
            ×
          </button></span
        >
      </div>
    </div>
    <button class="setting-row row-button" :aria-expanded="expanded" @click="expanded = !expanded">
      <span>已屏蔽用户</span
      ><span class="helper"
        >{{ app.settings.blockedUsers.length }}/200 · {{ expanded ? '收起' : '管理' }}</span
      >
    </button>
    <div v-if="expanded" class="blocked-list">
      <p v-if="!app.settings.blockedUsers.length" class="helper">右键弹幕可屏蔽用户。</p>
      <div v-for="(user, index) in app.settings.blockedUsers" :key="index" class="blocked-row">
        <div>
          <span>{{ user.nickname }}</span>
          <p class="helper">
            直播间 {{ user.roomId }} · {{ user.userId ? '按用户 ID' : '按昵称（含同名用户）' }}
          </p>
        </div>
        <ElButton
          size="small"
          :disabled="app.saving.value"
          :aria-label="`解除屏蔽 ${user.nickname}`"
          @click="
            app.save({ blockedUsers: app.settings.blockedUsers.filter((_, i) => i !== index) })
          "
          >解除</ElButton
        >
      </div>
    </div>
  </div>
  <p class="helper section-note">
    屏蔽仅在对应直播间生效；过滤和屏蔽保存在本机，不影响抖音账号。过滤消息仍占用最多 2000
    条本地缓冲。
  </p>
</template>
<style scoped>
.own-name {
  padding: 0 0 12px;
}
.filter-editor {
  padding: 12px 0;
  border-top: 1px solid var(--line);
}
.filter-editor form {
  display: flex;
  gap: 6px;
  margin-top: 9px;
}
.filter-editor .el-input {
  min-width: 0;
}
.filter-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}
.filter-tags > span {
  background: var(--accent-soft);
  border-radius: 5px;
  padding: 4px 7px;
  color: var(--text);
  font-size: 11px;
  overflow-wrap: anywhere;
  max-width: 100%;
}
.filter-tags button {
  background: none;
  border: 0;
  color: var(--muted);
  padding: 0 0 0 7px;
}
.blocked-list {
  padding: 10px 0;
}
.blocked-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}
.blocked-row > div {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 12px;
}
</style>
