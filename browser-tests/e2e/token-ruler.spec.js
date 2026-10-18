/* eslint-disable no-undef -- Browser globals used in page.evaluate */
const { expect, createSessionTest, significantConsoleErrors } = require('./fixtures')

/**
 * DCC movement bands on the token ruler (module/token-ruler.mjs).
 *
 * A character may move its normal speed per action, so the ruler colors each
 * segment against `speed × action dice`: within the first action green, the
 * last allowed action amber, past every action red. The action count comes
 * from the derived `attributes.actionDice.list`, so a world that leaves the
 * `multipleActionDice` switch off (the default) keeps a single move even for
 * an actor whose stored action-dice expression names several dice.
 *
 * The probes go through core's real measurement
 * (`TokenDocument#measureMovementPath`) on a live grid, and `TokenRuler#refresh`
 * runs the actual drag-time draw path.
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

  test('follows the multipleActionDice switch on a live grid', async ({ page }) => {
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
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
      const feetPx = canvas.grid.size / canvas.grid.distance

      /** 30ft-speed actor + token + a probe that colors one segment via the live ruler. */
      const probeFor = async (actionDice, y) => {
        const actor = await Actor.create({
          name: `DCC Ruler Probe (${actionDice})`,
          type: 'Player',
          system: {
            config: { actionDice },
            attributes: { speed: { value: '30', base: '30' } }
          }
        })
        const [tokenDoc] = await scene.createEmbeddedDocuments('Token', [
          { name: 'Probe', actorId: actor.id, x: 500, y, width: 1, height: 1 }
        ])
        const drawDeadline = Date.now() + 5000
        while (Date.now() < drawDeadline && !game.canvas.tokens.get(tokenDoc.id)?.ruler) await sleep(50)
        const token = game.canvas.tokens.get(tokenDoc.id)
        return {
          token,
          list: token.actor.system.attributes.actionDice.list?.length ?? null,
          colorAt: feet => {
            const doc = token.document
            // Core's own measurement: no cost function ⇒ cost === distance in feet
            const measurement = doc.measureMovementPath(
              [{ x: doc.x, y: doc.y }, { x: doc.x + (feet * feetPx), y: doc.y }], {})
            return token.ruler._getSegmentStyle({
              measurement: measurement.waypoints.at(-1),
              actionConfig: CONFIG.Token.movement.actions.walk
            }).color
          }
        }
      }

      const switchWasOn = game.settings.get('dcc', 'multipleActionDice')
      const off = await probeFor('1d20,1d16', 500)
      await game.settings.set('dcc', 'multipleActionDice', true)
      let on
      try {
        on = await probeFor('1d20,1d16', 800)

        // The drag-time draw path: 45ft of pending movement, then tear down.
        const doc = on.token.document
        on.token.ruler.refresh({
          passedWaypoints: [],
          pendingWaypoints: [
            { x: doc.x, y: doc.y, action: 'walk', explicit: true },
            { x: doc.x + (45 * feetPx), y: doc.y, action: 'walk', explicit: true }
          ],
          plannedMovement: {}
        })
        on.token.ruler.clear()
      } finally {
        await game.settings.set('dcc', 'multipleActionDice', switchWasOn)
      }

      return {
        switchWasOn,
        off: { list: off.list, first: off.colorAt(25), over: off.colorAt(35), far: off.colorAt(60) },
        on: { list: on.list, first: on.colorAt(25), second: on.colorAt(45), overBudget: on.colorAt(65) }
      }
    })

    // World default: the switch is off, so the stored "1d20,1d16" still buys one
    // move — 35ft is already over budget
    expect(result.switchWasOn).toBe(false)
    expect(result.off.list).toBeNull()
    expect(result.off.first).toBe(GREEN)
    expect(result.off.over).toBe(RED)
    expect(result.off.far).toBe(RED)

    // Switch on: two derived actions → 30ft, then 60ft
    expect(result.on.list).toBe(2)
    expect(result.on.first).toBe(GREEN)
    expect(result.on.second).toBe(AMBER)
    expect(result.on.overBudget).toBe(RED)
    expect(significantConsoleErrors(consoleErrors)).toEqual([])
  })
})
