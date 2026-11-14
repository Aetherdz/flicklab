/**
 * Inline SVG glyphs for the mode cards. Stroke-only, 24px grid, currentColor,
 * so a card can tint them without a second asset.
 */
const svg = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const MODE_ICONS = {
  gridshot: svg(
    '<rect x="3" y="3" width="18" height="18" rx="1" />' +
      '<path d="M9 3v18M15 3v18M3 9h18M3 15h18" />' +
      '<circle cx="6" cy="6" r="2" fill="currentColor" stroke="none" />' +
      '<circle cx="18" cy="12" r="2" fill="currentColor" stroke="none" />' +
      '<circle cx="12" cy="18" r="2" fill="currentColor" stroke="none" />',
  ),
  flick: svg(
    '<circle cx="5" cy="19" r="2.2" />' +
      '<circle cx="19" cy="5" r="2.6" />' +
      '<path d="M7.9 16.1 16.1 7.9" stroke-dasharray="3 3" />',
  ),
  tracking: svg(
    '<path d="M2 13c2.4-6 4.8-6 7.2 0s4.8 6 7.2 0 2.4-3.4 3.6-2.4" />' +
      '<circle cx="13" cy="13" r="2.4" fill="currentColor" stroke="none" />',
  ),
  precision: svg(
    '<circle cx="12" cy="12" r="9.2" />' +
      '<circle cx="12" cy="12" r="5.4" />' +
      '<circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />',
  ),
  reaction: svg(
    '<circle cx="12" cy="13.4" r="7.6" />' +
      '<path d="M12 9.6v4.2l2.8 1.7" />' +
      '<path d="M9.4 2.8h5.2M12 2.8v2.2M18.8 6.6l1.4 1.4" />',
  ),
  cps: svg(
    '<circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />' +
      '<path d="M12 4.2v2.2M12 17.6v2.2M4.2 12h2.2M17.6 12h2.2" />' +
      '<path d="M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6" />',
  ),
};

export const PRIMARY_CTA_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.1v13.8L19.2 12z" fill="currentColor" /></svg>`;

export const PLAY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.1v13.8L19.2 12z" fill="currentColor" /></svg>`;