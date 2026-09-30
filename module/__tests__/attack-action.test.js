import { describe, expect, test } from 'vitest'
import { getAttackActionName } from '../attack-action.js'

describe('getAttackActionName', () => {
  test('localizes attack labels for German instead of exposing English verbs', () => {
    const labels = {
      'DCC.Attack': 'Angriff',
      'DCC.Backstab': 'Hinterhältiger Angriff'
    }
    const i18n = { lang: 'de', localize: (key) => labels[key] }

    expect(getAttackActionName(false, i18n)).toBe('Angriff')
    expect(getAttackActionName(true, i18n)).toBe('Hinterhältiger Angriff')
  })

  test('keeps the existing English verbs for other languages', () => {
    const i18n = { lang: 'en', localize: () => 'unused' }

    expect(getAttackActionName(false, i18n)).toBe('attacks')
    expect(getAttackActionName(true, i18n)).toBe('backstabs')
  })
})
