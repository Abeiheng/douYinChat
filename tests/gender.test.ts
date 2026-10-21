import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
const source = readFileSync(new URL('../extension/content.js', import.meta.url), 'utf8')
const readGender = runInNewContext(
  `${source.slice(source.indexOf('function readPublicGender('))}; readPublicGender`,
  { URL }
) as (card: { querySelectorAll: () => { src: string }[] }) => string
const card = (...urls: string[]): { querySelectorAll: () => { src: string }[] } => ({
  querySelectorAll: () => urls.map((src) => ({ src }))
})
test('gender comes only from recognized public profile icons on the platform CDN', () => {
  assert.equal(
    readGender(card('https://p3-webcast.douyinpic.com/img/webcast/gender_male.png~tplv-obj.png')),
    'male'
  )
  assert.equal(
    readGender(card('https://p3-webcast.douyinpic.com/img/webcast/gender_female.png~tplv-obj.png')),
    'female'
  )
  assert.equal(readGender(card()), 'unknown')
  assert.equal(
    readGender(
      card(
        'https://evil.example/gender_female.png',
        'https://p3-webcast.douyinpic.com/img/unknown.png'
      )
    ),
    'unknown'
  )
  assert.equal(
    readGender(card('https://p3-webcast.douyinpic.com/img/gender_female.png-spoof')),
    'unknown'
  )
})
