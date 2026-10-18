/**
 * Unit coverage for the DCC movement-band token ruler.
 *
 * The band arithmetic and the actor → allowance mapping are pure helpers; the
 * registration tests check the two styling overrides (grid cells + label) and
 * that the path line is left to core. The live measurement (real grid, real
 * drag, real label markup) is covered by
 * `browser-tests/e2e/token-ruler.spec.js`.
 */

import { describe, expect, test } from 'vitest'

import '../__mocks__/foundry.js'

import { movementBand, movementBands, registerTokenRuler } from '../token-ruler.mjs'

const GREEN = 0x2ecc71
const AMBER = 0xf1c40f
const ORANGE = 0xe67e22
const RED = 0xe74c3c

/** Minimal actor shape read by movementBands. */
function makeActor ({ speed = '30', list } = {}) {
  return { system: { attributes: { speed: { value: speed }, actionDice: { list } } } }
}

describe('movementBands', () => {
  test('reads the DCC movement rate and the action-dice count', () => {
    expect(movementBands(makeActor({ list: [{ die: 'd20' }, { die: 'd16' }] }))).toEqual({ speed: 30, actions: 2 })
  })

  test('an opted-out world (no derived list) has a single move', () => {
    expect(movementBands(makeActor())).toEqual({ speed: 30, actions: 1 })
  })

  test('strips units from the speed value', () => {
    expect(movementBands(makeActor({ speed: "20'" }))?.speed).toBe(20)
  })

  test('counts every derived slot', () => {
    expect(movementBands(makeActor({ list: [{}, {}, {}] }))?.actions).toBe(3)
  })

  test('returns null when the actor cannot move ("MV none")', () => {
    expect(movementBands(makeActor({ speed: 'none' }))).toBeNull()
  })

  test('returns null without an actor', () => {
    expect(movementBands(undefined)).toBeNull()
  })
})

describe('movementBand', () => {
  const twoActions = { speed: 30, actions: 2 }

  test('first action is green', () => {
    expect(movementBand(twoActions, 20)).toEqual({ color: GREEN, cssClass: 'move-range' })
  })

  test('a cost ending exactly on the first limit stays green', () => {
    expect(movementBand(twoActions, 30).cssClass).toBe('move-range')
  })

  test('second action is amber', () => {
    expect(movementBand(twoActions, 45)).toEqual({ color: AMBER, cssClass: 'extra-move-range' })
  })

  test('second limit stays on the last allowed band', () => {
    expect(movementBand(twoActions, 60).cssClass).toBe('extra-move-range')
  })

  test('beyond every action is red', () => {
    expect(movementBand(twoActions, 60.1)).toEqual({ color: RED, cssClass: 'out-of-range' })
  })

  test('a single-action actor has no second band', () => {
    expect(movementBand({ speed: 30, actions: 1 }, 35).cssClass).toBe('out-of-range')
  })

  test('bands past the palette keep the warmest allowed color', () => {
    const fourActions = { speed: 10, actions: 4 }
    expect(movementBand(fourActions, 35)).toEqual({ color: ORANGE, cssClass: 'third-move-range' })
    expect(movementBand(fourActions, 45).cssClass).toBe('out-of-range')
  })

  test('terrain multipliers count against the budget', () => {
    // 20ft of difficult terrain costs 40
    expect(movementBand(twoActions, 40).cssClass).toBe('extra-move-range')
  })

  test('zero cost is green', () => {
    expect(movementBand(twoActions, 0).color).toBe(GREEN)
  })

  test('unknown allowance keeps core styling', () => {
    expect(movementBand(null, 40)).toBeNull()
    expect(movementBand(twoActions, Number.NaN)).toBeNull()
  })
})

describe('registerTokenRuler', () => {
  class CoreRuler {
    _getGridHighlightStyle () {
      return this.coreHighlight ?? { color: 0x000000, alpha: 0.5 }
    }

    _getWaypointLabelContext () {
      return this.coreContext ?? { cssClass: 'pending', cost: { total: '20' } }
    }

    _getSegmentStyle () {
      return { width: 4, color: 0x000000, alpha: 1 }
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

  const waypointAt = cost => ({ measurement: { cost }, actionConfig: {} })

  test('registers a TokenRuler subclass', () => {
    const ruler = makeRuler(makeActor({ list: [{}, {}] }))
    expect(Object.getPrototypeOf(ruler.constructor)).toBe(CoreRuler)
  })

  test('colors the swept grid cells by cumulative cost, keeping core alpha', () => {
    const ruler = makeRuler(makeActor({ list: [{}, {}] }))
    expect(ruler._getGridHighlightStyle(waypointAt(20))).toEqual({ color: GREEN, alpha: 0.5 })
    expect(ruler._getGridHighlightStyle(waypointAt(65)).color).toBe(RED)
  })

  test('leaves cells core does not draw alone', () => {
    const ruler = makeRuler(makeActor({ list: [{}, {}] }))
    ruler.coreHighlight = { alpha: 0 }
    expect(ruler._getGridHighlightStyle(waypointAt(20))).toEqual({ alpha: 0 })
  })

  test('adds the band class to the label chip', () => {
    const ruler = makeRuler(makeActor({ list: [{}, {}] }))
    expect(ruler._getWaypointLabelContext(waypointAt(45)).cssClass).toBe('pending extra-move-range')
    expect(ruler._getWaypointLabelContext(waypointAt(65)).cssClass).toBe('pending out-of-range')
  })

  test('leaves the label and the path line core-colored without an allowance', () => {
    const ruler = makeRuler(makeActor({ speed: 'none' }))
    expect(ruler._getWaypointLabelContext(waypointAt(45)).cssClass).toBe('pending')
    expect(ruler._getSegmentStyle(waypointAt(65)).color).toBe(0x000000)
  })

  test('keeps the path line in core color (the moving user identifies it)', () => {
    const ruler = makeRuler(makeActor({ list: [{}, {}] }))
    expect(ruler._getSegmentStyle(waypointAt(65))).toEqual({ width: 4, color: 0x000000, alpha: 1 })
  })
})
