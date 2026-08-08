import { useId } from 'react'

/** One corner fan of cards; the four corners render it mirrored. */
const CornerFan = () => (
  <g>
    <rect x="45" y="55" width="95" height="210" rx="16" fill="#2E79D7" transform="rotate(-2 92 160)" />
    <rect x="92" y="38" width="110" height="220" rx="16" fill="#16A43A" transform="rotate(-19 147 148)" />
    <rect x="145" y="26" width="110" height="200" rx="16" fill="#FFD31A" transform="rotate(-35 200 126)" />
    <rect x="190" y="28" width="125" height="160" rx="16" fill="#EF3B30" transform="rotate(-53 252 108)" />
  </g>
)

/**
 * The uniform Ligretto card back, drawn for a face-down card. Fills its
 * parent; the same artwork for every card, so it leaks nothing about the face.
 */
export const CardBackFace = () => {
  const clipId = useId()

  return (
    <svg width="100%" height="100%" viewBox="0 0 700 980" preserveAspectRatio="none" style={{ display: 'block' }} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id={clipId}>
          <rect x="20" y="20" width="660" height="940" rx="48" />
        </clipPath>
      </defs>

      <rect x="20" y="20" width="660" height="940" rx="48" fill="#0A4D98" />
      <rect x="38" y="38" width="624" height="904" rx="34" fill="#0E5FB8" />

      <g clipPath={`url(#${clipId})`}>
        {/* Subtle diagonal motion lines */}
        <g stroke="#2B75C8" strokeWidth="13" strokeLinecap="round" opacity="0.55">
          <line x1="250" y1="80" x2="370" y2="-40" />
          <line x1="315" y1="135" x2="460" y2="-10" />
          <line x1="380" y1="195" x2="525" y2="50" />
          <line x1="445" y1="255" x2="595" y2="105" />
          <line x1="90" y1="410" x2="245" y2="255" />
          <line x1="130" y1="485" x2="300" y2="315" />
          <line x1="400" y1="650" x2="555" y2="495" />
          <line x1="455" y1="715" x2="620" y2="550" />
          <line x1="145" y1="850" x2="305" y2="690" />
          <line x1="215" y1="920" x2="365" y2="770" />
        </g>

        <CornerFan />
        <g transform="translate(700,0) scale(-1,1)">
          <CornerFan />
        </g>
        <g transform="translate(0,980) scale(1,-1)">
          <CornerFan />
        </g>
        <g transform="translate(700,980) scale(-1,-1)">
          <CornerFan />
        </g>

        {/* Central confetti / motion marks */}
        <g fill="none" strokeLinecap="round">
          <line x1="280" y1="355" x2="260" y2="325" stroke="#EF3B30" strokeWidth="13" />
          <line x1="350" y1="350" x2="350" y2="315" stroke="#2E79D7" strokeWidth="13" />
          <line x1="415" y1="355" x2="430" y2="325" stroke="#EF3B30" strokeWidth="13" />
          <line x1="305" y1="410" x2="292" y2="388" stroke="#16A43A" strokeWidth="10" />
          <line x1="395" y1="410" x2="408" y2="389" stroke="#FFD31A" strokeWidth="10" />

          <circle cx="350" cy="440" r="18" stroke="#FFD31A" strokeWidth="9" />
          <polygon points="295,505 315,470 335,505" stroke="#FFD31A" strokeWidth="8" strokeLinejoin="round" />
          <rect x="385" y="475" width="32" height="32" rx="5" stroke="#FFFFFF" strokeWidth="8" transform="rotate(12 401 491)" />

          <line x1="270" y1="570" x2="250" y2="600" stroke="#EF3B30" strokeWidth="13" />
          <line x1="350" y1="565" x2="350" y2="605" stroke="#2E79D7" strokeWidth="13" />
          <line x1="430" y1="570" x2="452" y2="592" stroke="#16A43A" strokeWidth="13" />
          <line x1="305" y1="625" x2="315" y2="645" stroke="#16A43A" strokeWidth="9" />
          <line x1="395" y1="625" x2="408" y2="646" stroke="#FFD31A" strokeWidth="9" />
        </g>

        {/* Small white corner symbols */}
        <g fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" opacity="0.95">
          <circle cx="90" cy="92" r="15" />
          <rect x="170" y="105" width="24" height="24" rx="4" transform="rotate(10 182 117)" />
          <polygon points="127,185 145,214 109,214" />

          <circle cx="610" cy="92" r="15" />
          <rect x="506" y="105" width="24" height="24" rx="4" transform="rotate(-10 518 117)" />
          <polygon points="573,185 591,214 555,214" />

          <circle cx="90" cy="888" r="15" />
          <rect x="170" y="845" width="24" height="24" rx="4" transform="rotate(-10 182 857)" />
          <polygon points="127,792 145,821 109,821" />

          <circle cx="610" cy="888" r="15" />
          <rect x="506" y="845" width="24" height="24" rx="4" transform="rotate(10 518 857)" />
          <polygon points="573,792 591,821 555,821" />
        </g>
      </g>

      <rect x="20" y="20" width="660" height="940" rx="48" fill="none" stroke="#083E7A" strokeWidth="12" />
    </svg>
  )
}
