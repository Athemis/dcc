/**
 * Return the action label used in an attack emote.
 *
 * The English verbs were historically passed directly by the chat renderer.
 * German has translated nouns for both actions, so use those labels there
 * rather than displaying the English verbs in a German chat message.
 *
 * @param {boolean} isBackstab Whether this is a backstab attack.
 * @param {object} i18n Foundry's internationalization service.
 * @returns {string} Localized action label, or the existing English verb.
 */
export function getAttackActionName (isBackstab, i18n) {
  if (i18n.lang === 'de') return i18n.localize(isBackstab ? 'DCC.Backstab' : 'DCC.Attack')
  return isBackstab ? 'backstabs' : 'attacks'
}
