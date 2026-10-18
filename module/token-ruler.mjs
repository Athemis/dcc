/* global CONFIG, foundry */

/**
 * DCC movement bands on Foundry's token ruler.
 *
 * A character moves its normal speed per action and may spend further actions
 * on movement, so the distance allowed in one round is `speed × action dice`
 * (DCC core rulebook, "Movement" and "Actions"). While a token is dragged the
 * ruler colors each segment against that budget: within the first action
 * green, each further allowed action warmer, past every action red.
 *
 * The action count comes from the derived `attributes.actionDice.list`, which
 * exists only while the world's `multipleActionDice` switch is on — a world
 * that opted out (the default) keeps its single move, matching the switch's
 * "when off, the system behaves exactly as it does today" contract.
 *
 * Only the segment style is overridden. The ruler's distance/cost labels, the
 * free measuring ruler, and the token's movement history stay core's.
 */

/** Allowed bands, first action → last allowed action, then over budget. */
const BAND_COLORS = [0x2ecc71, 0xf1c40f, 0xe67e22]
const OVER_BUDGET_COLOR = 0xe74c3c

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
 * Segment color for a cumulative movement cost.
 *
 * @param {{speed: number, actions: number}|null} bands  From {@link movementBands}
 * @param {number} cost  Cumulative cost in scene units (terrain multipliers included)
 * @returns {number|null}  `null` to keep core's color
 */
export function movementBandColor (bands, cost) {
  if (!bands || !Number.isFinite(cost)) return null
  // A segment ending exactly on a limit belongs to the band it completes; the
  // epsilon keeps that boundary off the next band despite float error.
  const band = Math.max(0, Math.floor((cost / bands.speed) - 1e-9))
  if (band >= bands.actions) return OVER_BUDGET_COLOR
  return BAND_COLORS[Math.min(band, BAND_COLORS.length - 1)]
}

/**
 * Register the DCC ruler on `CONFIG.Token.rulerClass`. Runs at `init`
 * (module/init-hook.mjs), before any token is drawn.
 */
export function registerTokenRuler () {
  class DCCTokenRuler extends foundry.canvas.placeables.tokens.TokenRuler {
    /** @override */
    _getSegmentStyle (waypoint) {
      const style = super._getSegmentStyle(waypoint)
      if (!style.width) return style
      const color = movementBandColor(movementBands(this.token?.actor), waypoint.measurement?.cost)
      return color === null ? style : { ...style, color }
    }
  }
  CONFIG.Token.rulerClass = DCCTokenRuler
}
