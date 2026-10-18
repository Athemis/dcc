/* global CONFIG, foundry */

/**
 * DCC movement bands on Foundry's token ruler.
 *
 * A character moves its normal speed per action and may spend further actions
 * on movement, so the distance allowed in one round is `speed × action dice`
 * (DCC core rulebook, "Movement" and "Actions"). While a token is dragged the
 * ruler colors the swept grid cells and the label's distance text against that
 * budget: first action green, each further allowed action warmer, past every
 * action red.
 *
 * The action count comes from the derived `attributes.actionDice.list`, which
 * exists only while the world's `multipleActionDice` switch is on — a world
 * that opted out (the default) keeps its single move, matching the switch's
 * "when off, the system behaves exactly as it does today" contract.
 *
 * The path line keeps core's color — the moving user's — so a GM watching
 * several players' planned movement can still tell whose is whose. The label
 * text is colored by a class on the label chip (styles/base.css, values from
 * the `--system-movement-*` variables); the band colors below mirror those
 * variables, since canvas fills take numbers.
 */

/** Allowed bands, first action → last allowed action, then over budget. */
const BANDS = [
  { color: 0x2ecc71, cssClass: 'move-range' },
  { color: 0xf1c40f, cssClass: 'extra-move-range' },
  { color: 0xe67e22, cssClass: 'third-move-range' }
]
const OVER_BUDGET = { color: 0xe74c3c, cssClass: 'out-of-range' }

/**
 * Movement allowance of an actor.
 *
 * Uses the derived `speed.value`, so armor penalties, manual modifiers and
 * active effects are already applied. `speed.value` may carry units (`30'`)
 * or read `none`; anything without a leading number yields `null`.
 *
 * @param {foundry.documents.Actor} actor
 * @returns {{speed: number, actions: number}|null}
 */
export function movementBands (actor) {
  const system = actor?.system
  const speed = parseInt(system?.attributes?.speed?.value)
  if (!Number.isFinite(speed) || (speed <= 0)) return null
  const actions = system?.attributes?.actionDice?.list?.length ?? 1
  return { speed, actions: Math.max(actions, 1) }
}

/**
 * The band a cumulative movement cost falls into.
 *
 * @param {{speed: number, actions: number}|null} bands  From {@link movementBands}
 * @param {number} cost  Cumulative cost in scene units (terrain multipliers included)
 * @returns {{color: number, cssClass: string}|null}  `null` to keep core's styling
 */
export function movementBand (bands, cost) {
  if (!bands || !Number.isFinite(cost)) return null
  // A segment ending exactly on a limit belongs to the band it completes; the
  // epsilon keeps that boundary off the next band despite float error.
  const band = Math.max(0, Math.floor((cost / bands.speed) - 1e-9))
  if (band >= bands.actions) return OVER_BUDGET
  return BANDS[Math.min(band, BANDS.length - 1)]
}

/**
 * Register the DCC ruler on `CONFIG.Token.rulerClass`. Runs at `init`
 * (module/init-hook.mjs), before any token is drawn.
 */
export function registerTokenRuler () {
  class DCCTokenRuler extends foundry.canvas.placeables.tokens.TokenRuler {
    /** @override */
    _getGridHighlightStyle (waypoint, offset) {
      const style = super._getGridHighlightStyle(waypoint, offset)
      if (!(style.alpha > 0)) return style
      const band = movementBand(movementBands(this.token?.actor), waypoint.measurement?.cost)
      return band ? { ...style, color: band.color } : style
    }

    /** @override */
    _getWaypointLabelContext (waypoint, state) {
      const context = super._getWaypointLabelContext(waypoint, state)
      const band = movementBand(movementBands(this.token?.actor), waypoint.measurement?.cost)
      if (band && context) context.cssClass = `${context.cssClass ?? ''} ${band.cssClass}`.trim()
      return context
    }
  }
  CONFIG.Token.rulerClass = DCCTokenRuler
}
