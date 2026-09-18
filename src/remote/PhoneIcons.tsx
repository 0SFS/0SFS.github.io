/**
 * Icons for the controller's chip grid that no icon set in the project has.
 * Drawn on a 24px grid in `currentColor`, so they take the chip's own colour —
 * accent when pressed — and scale with it. Decorative: every button that uses
 * one carries its own label.
 */
const stroke = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
} as const

/** From the seat: two windshield panes over an instrument panel. */
export function CockpitIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <path {...stroke} d="M4.5 14 6.5 5.5Q12 3.8 17.5 5.5L19.5 14Z" />
    <path {...stroke} d="M12 4.5V14" />
    <rect {...stroke} x="2.5" y="14" width="19" height="6" rx="1.5" />
    <circle cx="8" cy="17" r="1.2" fill="currentColor" />
    <circle cx="16" cy="17" r="1.2" fill="currentColor" />
  </svg>
}

/** From behind: fuselage, wings and the Vision Jet's V-tail. */
export function ChaseIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <circle {...stroke} cx="12" cy="14" r="2.3" />
    <path {...stroke} d="M2.5 15.2 9.7 14.2M14.3 14.2 21.5 15.2" />
    <path {...stroke} d="M10.8 12 7.6 6.5M13.2 12 16.4 6.5" />
  </svg>
}
