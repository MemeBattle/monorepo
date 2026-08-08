/**
 * Hand-drawn loop that circles a highlighted element.
 *
 * Fills its parent, so the parent's box defines what the loop wraps: the
 * drawing is stretched (`preserveAspectRatio="none"`) while the stroke keeps a
 * constant width (`vectorEffect="non-scaling-stroke"`).
 *
 * Figma: https://www.figma.com/design/zLXO12ISnORKAut0uduasj/Ligretto?node-id=1036-348
 */
export function OnboardingOutline() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 273 243"
      preserveAspectRatio="none"
      fill="none"
      style={{ display: 'block', overflow: 'visible' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M133.011 11.6175C95.6207 8.98742 13.5021 30.554 3.01866 103.144C-9.79397 191.862 36.9908 264.523 183.005 234.507C323.083 205.711 291.308 -4.16294 121.479 1.09719"
        stroke="white"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
