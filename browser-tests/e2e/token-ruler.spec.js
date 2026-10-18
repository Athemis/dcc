/* eslint-disable no-undef -- Browser globals used in page.evaluate */
const { expect, createSessionTest, createProbeScene, significantConsoleErrors } = require('./fixtures')

/**
 * DCC movement bands on the token ruler (module/token-ruler.mjs).
 *
 * A character may move its normal speed per action, so the ruler colors the
 * swept grid cells and the label's distance text against `speed × action dice`:
 * within the first action green, the later allowed actions warmer, past every
 * action red. The action count comes from the derived `attributes.actionDice.list`,
 * so a world that leaves the `multipleActionDice` switch off (the default) keeps
 * a single move even for an actor whose stored action-dice expression names
 * several dice. The path line itself stays core's (the moving user's color).
 *
 * Cells and bands are probed through core's real measurement
 * (`TokenDocument#measureMovementPath`) on a live grid; the label is read off a
 * **real mouse drag**, because only a real drag gives the pending path finite
 * costs — a hand-built `TokenRuler#refresh` labels its end point `∞ ft`.
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
const AMBER_CSS = 'rgb(241, 196, 15)'

test.describe('Token ruler movement bands', () => {
  test.beforeEach(() => {
    consoleErrors.length = 0
  })

  test('registers the DCC ruler class at init', async ({ page }) => {
    expect(await page.evaluate(() => CONFIG.Token.rulerClass?.name)).toBe('DCCTokenRuler')
  })

  test('follows the multipleActionDice switch on a live grid', async ({ page }) => {
    await createProbeScene(page, 'DCC Token Ruler Probe')
    const result = await page.evaluate(async () => {
      const scene = game.canvas.scene
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
      const feetPx = canvas.grid.size / canvas.grid.distance

      /** 30ft-speed actor + token + probes that run through the live ruler. */
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
        const doc = token.document
        const waypointAt = feet => {
          // Core's own measurement: no cost function ⇒ cost === distance in feet
          const measurement = doc.measureMovementPath(
            [{ x: doc.x, y: doc.y }, { x: doc.x + (feet * feetPx), y: doc.y }], {})
          return { measurement: measurement.waypoints.at(-1), actionConfig: CONFIG.Token.movement.actions.walk }
        }
        return {
          list: token.actor.system.attributes.actionDice.list?.length ?? null,
          cellAt: feet => token.ruler._getGridHighlightStyle(waypointAt(feet), { i: 0, j: 0 }).color,
          lineAt: feet => token.ruler._getSegmentStyle(waypointAt(feet)).color
        }
      }

      const switchWasOn = game.settings.get('dcc', 'multipleActionDice')
      const off = await probeFor('1d20,1d16', 500)
      const offProbe = {
        list: off.list,
        cell25: off.cellAt(25),
        cell35: off.cellAt(35),
        cell60: off.cellAt(60),
        line65: off.lineAt(65)
      }
      await game.settings.set('dcc', 'multipleActionDice', true)
      let onProbe
      try {
        const on = await probeFor('1d20,1d16', 800)
        onProbe = {
          list: on.list,
          cell25: on.cellAt(25),
          cell45: on.cellAt(45),
          cell65: on.cellAt(65),
          line65: on.lineAt(65)
        }
      } finally {
        await game.settings.set('dcc', 'multipleActionDice', switchWasOn)
      }

      return { switchWasOn, off: offProbe, on: onProbe }
    })

    // World default: the switch is off, so the stored "1d20,1d16" still buys one
    // move — 35ft is already over budget
    expect(result.switchWasOn).toBe(false)
    expect(result.off.list).toBeNull()
    expect(result.off.cell25).toBe(GREEN)
    expect(result.off.cell35).toBe(RED)
    expect(result.off.cell60).toBe(RED)

    // Switch on: two derived actions → 30ft, then 60ft
    expect(result.on.list).toBe(2)
    expect(result.on.cell25).toBe(GREEN)
    expect(result.on.cell45).toBe(AMBER)
    expect(result.on.cell65).toBe(RED)

    // The path line stays core's, so a GM can still tell whose drag is whose
    expect(result.off.line65).toBe(0x000000)
    expect(result.on.line65).toBe(0x000000)
    expect(significantConsoleErrors(consoleErrors)).toEqual([])
  })

  test('colors the label of a dragged path by the band', async ({ page }) => {
    await createProbeScene(page, 'DCC Token Ruler Label Probe')
    const setup = await page.evaluate(async () => {
      const scene = game.canvas.scene
      globalThis.__rulerSwitchWasOn = game.settings.get('dcc', 'multipleActionDice')
      await game.settings.set('dcc', 'multipleActionDice', true)
      const actor = await Actor.create({
        name: 'DCC Ruler Label Probe',
        type: 'Player',
        system: {
          config: { actionDice: '1d20,1d16' },
          attributes: { speed: { value: '30', base: '30' } }
        }
      })
      const [doc] = await scene.createEmbeddedDocuments('Token', [
        { name: 'Label Probe', actorId: actor.id, x: 200, y: 300, width: 1, height: 1 }
      ])
      const wait = Date.now() + 5000
      while (Date.now() < wait && !game.canvas.tokens.get(doc.id)?.ruler) await new Promise(resolve => setTimeout(resolve, 50))
      const token = game.canvas.tokens.get(doc.id)
      token.control({ releaseOthers: true })
      canvas.pan({ x: token.center.x, y: token.center.y, scale: 1 })
      await new Promise(resolve => setTimeout(resolve, 1000))
      return {
        client: canvas.clientCoordinatesFromCanvas(token.center),
        feetPx: canvas.grid.size / canvas.grid.distance,
        actions: token.actor.system.attributes.actionDice.list?.length ?? null
      }
    })

    expect(setup.actions).toBe(2)
    let chips = []
    try {
      await page.mouse.move(setup.client.x, setup.client.y)
      await page.mouse.down()
      await page.mouse.move(setup.client.x + (45 * setup.feetPx), setup.client.y, { steps: 20 })
      const handle = await page.waitForFunction(() => {
        const chips = [...document.querySelectorAll('.waypoint-label')].map(chip => ({
          text: chip.textContent.trim(),
          classes: chip.className,
          color: chip.querySelector('.total-measurement')
            ? getComputedStyle(chip.querySelector('.total-measurement')).color
            : null
        }))
        return chips.some(chip => chip.text.startsWith('45 ft')) ? chips : null
      }, null, { timeout: 5000 })
      chips = await handle.jsonValue()
    } finally {
      await page.mouse.up()
      await page.evaluate(async () => {
        await game.settings.set('dcc', 'multipleActionDice', globalThis.__rulerSwitchWasOn)
      })
    }

    const chip = chips.find(c => c.text.startsWith('45 ft'))
    expect(chip, `45 ft chip (got ${JSON.stringify(chips)})`).toBeTruthy()
    // 45ft is inside the second action: amber cells, amber label text
    expect(chip.classes).toContain('extra-move-range')
    expect(chip.color).toBe(AMBER_CSS)
    expect(significantConsoleErrors(consoleErrors)).toEqual([])
  })
})
