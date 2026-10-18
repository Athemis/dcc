/**
 * Unit coverage for the DCC movement-band token ruler.
 *
 * The band arithmetic and the actor → allowance mapping are pure helpers; the
 * registration test checks the segment-style override against a stand-in core
 * ruler. The live measurement (real grid, real drag) is covered by
 * `browser-tests/e2e/token-ruler.spec.js`.
 */

import { describe, expect, test } from 'vitest'

import '../__mocks__/foundry.js'

import { movementBandColor, movementBands, registerTokenRuler } from '../token-ruler.mjs'

const GREEN = 0x2ecc71
const AMBER = 0xf1c40f
const ORANGE = 0xe67e22
const RED = 0xe74c3c

/** Minimal actor shape read by movementBands. */
function makeActor ({ speed = '30', config, value = '1d20' } = {}) {
  return { system: { attributes: { speed: { value: speed }, actionDice: { value } }, config: { actionDice: config } } }
}

describe('movementBands', () => {
  test('reads the DCC movement rate and the action-dice count', () => {
    expect(movementBands(makeActor({ config: '1d20,1d16' }))).toEqual({ speed: 30, actions: 2 })
  })

  test('treats an actor with one action die as a single move', () => {
    expect(movementBands(makeActor({ config: '1d20' }))).toEqual({ speed: 30, actions: 1 })
  })

  test('strips units from the speed value', () => {
    expect(movementBands(makeActor({ speed: "20'" }))?.speed).toBe(20)
  })

  test('counts "Act 3d20" as three actions', () => {
    expect(movementBands(makeActor({ config: '1d20', value: '3d20' }))?.actions).toBe(3)
  })

  test('returns null when the actor cannot move ("MV none")', () => {
    expect(movementBands(makeActor({ speed: 'none' }))).toBeNull()
  })

  test('returns null without an actor', () => {
    expect(movementBands(undefined)).toBeNull()
  })
})

describe('movementBandColor', () => {
  const twoActions = { speed: 30, actions: 2 }

  test('first action is green', () => {
    expect(movementBandColor(twoActions, 20)).toBe(GREEN)
  })

  test('a segment ending exactly on the first limit stays green', () => {
    expect(movementBandColor(twoActions, 30)).toBe(GREEN)
  })

  test('second action is amber', () => {
    expect(movementBandColor(twoActions, 45)).toBe(AMBER)
  })

  test('second limit stays on the last allowed band', () => {
    expect(movementBandColor(twoActions, 60)).toBe(AMBER)
  })

  test('beyond every action is red', () => {
    expect(movementBandColor(twoActions, 60.1)).toBe(RED)
  })

  test('a single-action actor has no second band', () => {
    expect(movementBandColor({ speed: 30, actions: 1 }, 35)).toBe(RED)
  })

  test('bands past the palette keep the warmest allowed color', () => {
    const fourActions = { speed: 10, actions: 4 }
    expect(movementBandColor(fourActions, 35)).toBe(ORANGE)
    expect(movementBandColor(fourActions, 45)).toBe(RED)
  })

  test('terrain multipliers count against the budget', () => {
    // 20ft of difficult terrain costs 40
    expect(movementBandColor(twoActions, 40)).toBe(AMBER)
  })

  test('zero cost is green', () => {
    expect(movementBandColor(twoActions, 0)).toBe(GREEN)
  })

  test('unknown allowance keeps core color', () => {
    expect(movementBandColor(null, 40)).toBeNull()
    expect(movementBandColor(twoActions, Number.NaN)).toBeNull()
  })
})

describe('registerTokenRuler', () => {
  class CoreRuler {
    _getSegmentStyle () {
      return this.coreStyle ?? { width: 4, color: 0x000000, alpha: 1 }
    }
  }

  function makeRuler (actor) {
    global.foundry.canvas = { placeables: { tokens: { TokenRuler: CoreRuler } } }
    global.CONFIG.Token = {}
    registerTokenRuler()
    const Ruler = global.CONFIG.Token.rulerClass
    const ruler = new Ruler()
    ruler.token = { actor }
    return ruler
  }

  test('registers a TokenRuler subclass', () => {
    const ruler = makeRuler(makeActor({ config: '1d20,1d16' }))
    expect(Object.getPrototypeOf(ruler.constructor)).toBe(CoreRuler)
  })

  test('colors the segment by cumulative cost, keeping width and alpha', () => {
    const ruler = makeRuler(makeActor({ config: '1d20,1d16' }))
    expect(ruler._getSegmentStyle({ measurement: { cost: 20 }, actionConfig: {} })).toEqual({
      width: 4, color: GREEN, alpha: 1
    })
    expect(ruler._getSegmentStyle({ measurement: { cost: 65 }, actionConfig: {} }).color).toBe(RED)
  })

  test('leaves invisible segments (non-visualized actions) alone', () => {
    const ruler = makeRuler(makeActor({ config: '1d20,1d16' }))
    ruler.coreStyle = { width: 0 }
    expect(ruler._getSegmentStyle({ measurement: { cost: 20 }, actionConfig: {} })).toEqual({ width: 0 })
  })

  test('leaves the core color when the actor has no allowance', () => {
    const ruler = makeRuler(makeActor({ speed: 'none' }))
    expect(ruler._getSegmentStyle({ measurement: { cost: 20 }, actionConfig: {} }).color).toBe(0x000000)
  })

  test('a single-action actor has no second band to move into', () => {
    const ruler = makeRuler(makeActor({ config: '1d20' }))
    const colorAt = cost => ruler._getSegmentStyle({ measurement: { cost }, actionConfig: {} }).color
    expect(colorAt(25)).toBe(GREEN)
    expect(colorAt(35)).toBe(RED)
  })
})
