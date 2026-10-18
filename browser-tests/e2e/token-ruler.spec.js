/* eslint-disable no-undef -- Browser globals used in page.evaluate */
const { expect, createSessionTest, significantConsoleErrors } = require('./fixtures')

/**
 * DCC movement bands on the token ruler (module/token-ruler.mjs).
 *
 * A character may move its normal speed per action, so the ruler's segment
 * colors follow `speed × action dice`: within the first action green, the last
 * allowed action amber, past every action red. The probes go through core's
 * real measurement (`TokenDocument#measureMovementPath`) on a live grid, and
 * `TokenRuler#refresh` runs the actual drag-time draw path.
 */

const consoleErrors = []
const test = createSessionTest({
  onConsole: msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  }
})

const GREEN = 0x2ecc71
const AMBER = 0xf1c40f
const RED = 0xe74c3c

test.describe('Token ruler movement bands', () => {
  test.beforeEach(() => {
    consoleErrors.length = 0
  })

  test('registers the DCC ruler class at init', async ({ page }) => {
    expect(await page.evaluate(() => CONFIG.Token.rulerClass?.name)).toBe('DCCTokenRuler')
  })

  test('colors ruler segments by speed × action dice on a live grid', async ({ page }) => {
    const result = await page.evaluate(async () => {
      // Probe scene with the default 5ft/100px grid, so 1ft = 20px.
      const scene = await Scene.create({
        name: 'DCC Token Ruler Probe',
        width: 4000,
        height: 3000,
        grid: { type: 1, size: 100, distance: 5, units: 'ft' }
      })
      const viewDeadline = Date.now() + 15000
      while (Date.now() < viewDeadline && !(game.canvas.ready && game.canvas.scene?.id === scene.id)) {
        if (game.canvas.scene?.id !== scene.id) {
          try { await scene.view() } catch { /* still loading — retry */ }
        }
        await new Promise(resolve => setTimeout(resolve, 200))
      }

      // 30ft speed, two action dice (6th-level warrior) → 30ft then 60ft.
      const actor = await Actor.create({
        name: 'DCC Ruler Probe',
        type: 'Player',
        system: {
          config: { actionDice: '1d20,1d16' },
          attributes: { speed: { value: '30', base: '30' } }
        }
      })
      const [tokenDoc] = await scene.createEmbeddedDocuments('Token', [
        { name: 'Probe', actorId: actor.id, x: 500, y: 500, width: 1, height: 1 }
      ])
      const drawDeadline = Date.now() + 5000
      while (Date.now() < drawDeadline && !(game.canvas.tokens.get(tokenDoc.id)?.ruler)) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      const token = game.canvas.tokens.get(tokenDoc.id)

      const feetPx = canvas.grid.size / canvas.grid.distance
      const doc = token.document
      const waypointAt = feet => ({
        x: doc.x + (feet * feetPx),
        y: doc.y
      })
      const probe = feet => {
        // Core's own measurement: no cost function ⇒ cost === distance in feet
        const measurement = doc.measureMovementPath([{ x: doc.x, y: doc.y }, waypointAt(feet)], {})
        const waypoint = measurement.waypoints.at(-1)
        return {
          cost: waypoint.cost,
          color: token.ruler._getSegmentStyle({
            measurement: waypoint,
            actionConfig: CONFIG.Token.movement.actions.walk
          }).color
        }
      }

      // The drag-time draw path: 45ft of pending movement, then tear down.
      token.ruler.refresh({
        passedWaypoints: [],
        pendingWaypoints: [
          { x: doc.x, y: doc.y, action: 'walk', explicit: true },
          { ...waypointAt(45), action: 'walk', explicit: true }
        ],
        plannedMovement: {}
      })
      token.ruler.clear()

      return {
        rulerClass: token.ruler.constructor.name,
        speed: token.actor.system.attributes.speed.value,
        first: probe(25),
        second: probe(45),
        overBudget: probe(65)
      }
    })

    // The derived speed reached the actor, and both bands match the allowance
    expect(Number(result.speed)).toBe(30)
    expect(result.first.cost).toBe(25)
    expect(result.second.cost).toBe(45)
    expect(result.overBudget.cost).toBe(65)
    expect(result.rulerClass).toBe('DCCTokenRuler')
    expect(result.first.color).toBe(GREEN)
    expect(result.second.color).toBe(AMBER)
    expect(result.overBudget.color).toBe(RED)
    expect(significantConsoleErrors(consoleErrors)).toEqual([])
  })
})
