import React from 'react'
import Svg, {
  Rect, Polyline, Line, Circle, G, Defs,
  LinearGradient as SvgGradient, Stop,
} from 'react-native-svg'

interface Props {
  size?: number
}

// Faithfully extracted from assets/keipr_logo_final.svg
// Receipt rect: 64×74, rx=11, rotated -10° around (32,38)
// Zigzag: polyline stroke at y=65..74
// Badge: amber circle at (70,14) r=13 with white checkmark
// viewBox gives bounding room for the tilted rect + badge

export default function KeiprIcon({ size = 64 }: Props) {
  return (
    <Svg
      width={size}
      height={size * (88 / 90)}
      viewBox="-7 -5 90 88"
    >
      <Defs>
        <SvgGradient id="kg" x1="0%" y1="0%" x2="130%" y2="130%">
          <Stop offset="0%" stopColor="#9F67F7" />
          <Stop offset="100%" stopColor="#5418C8" />
        </SvgGradient>
      </Defs>

      {/* Receipt body — tilted -10° */}
      <G transform="rotate(-10, 32, 38)">
        <Rect x="0" y="0" width="64" height="74" rx="11" fill="url(#kg)" />

        {/* Zigzag tear at bottom */}
        <Polyline
          points="0,65 8,74 16,65 24,74 32,65 40,74 48,65 56,74 64,65"
          fill="none"
          stroke="#3B0F99"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />

        {/* Receipt content lines */}
        <Line x1="11" y1="20" x2="53" y2="20" stroke="rgba(255,255,255,0.95)" strokeWidth="4" strokeLinecap="round" />
        <Line x1="11" y1="31" x2="43" y2="31" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" />
        <Line x1="11" y1="40" x2="47" y2="40" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" />
        <Line x1="11" y1="51" x2="29" y2="51" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />
        <Line x1="34" y1="51" x2="53" y2="51" stroke="rgba(255,255,255,0.95)" strokeWidth="3.5" strokeLinecap="round" />
      </G>

      {/* Amber badge with checkmark */}
      <Circle cx="70" cy="14" r="13" fill="#F59E0B" />
      <Circle cx="70" cy="14" r="13" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
      <Polyline
        points="64,14 68,18 77,8"
        fill="none"
        stroke="white"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
