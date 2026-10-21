import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateUserProfile } from '../src/shared/types'
test('public user profile accepts only bounded fields and approved HTTPS avatar hosts', () => {
  const profile = validateUserProfile({
    nickname: '北恒碎碎念',
    avatar: 'https://p11.douyinpic.com/avatar.jpeg',
    location: '安阳',
    stats: '17 关注 · 62 粉丝',
    privateField: 'ignored'
  })
  assert.equal(profile.location, '安阳')
  assert.equal('privateField' in profile, false)
  for (const avatar of [
    'javascript:alert(1)',
    'https://p11.douyinpic.com.evil.example/avatar',
    'http://p11.douyinpic.com/avatar',
    'https://user:pass@p11.douyinpic.com/avatar'
  ]) {
    assert.throws(() => validateUserProfile({ nickname: '测试', avatar }))
  }
  assert.throws(() => validateUserProfile({ nickname: '' }))
  assert.throws(() => validateUserProfile({ nickname: '测试', stats: 'x'.repeat(301) }))
})

test('gender validation keeps public markers and rejects unsupported values', () => {
  assert.equal(validateUserProfile({ nickname: '测试', gender: 'male' }).gender, 'male')
  assert.equal(validateUserProfile({ nickname: '测试', gender: 'female' }).gender, 'female')
  assert.equal(validateUserProfile({ nickname: '测试', gender: 'unknown' }).gender, 'unknown')
  assert.equal(validateUserProfile({ nickname: '测试' }).gender, undefined)
  assert.throws(() => validateUserProfile({ nickname: '测试', gender: 'guessed' }))
})
