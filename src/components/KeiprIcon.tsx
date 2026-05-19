import React from 'react'
import Svg, {
  Path, Rect, Defs, Circle,
  LinearGradient as SvgGradient, Stop,
  Text as SvgText,
} from 'react-native-svg'
import { Colors } from '../constants/colors'

interface Props {
  size?: number
}

// viewBox: 70 × 82
// Body: 64 × 62, rounded top corners (r=10), origin (0,0)
// Teeth: 8 × (8px wide, 10px tall) starting at y=62
// Badge: amber circle centered at (58, 12), overlapping top-right of body

export default function KeiprIcon({ size = 60 }: Props) {
  return (
    <Svg
      width={size}
      height={size * (82 / 70)}
      viewBox="0 0 70 82"
    >
      <Defs>
        <SvgGradient id="kg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={Colors.purpleLight} />
          <Stop offset="1" stopColor={Colors.purpleDark} />
        </SvgGradient>
      </Defs>

      {/* Receipt body — rounded top corners only */}
      <Path
        d="M 10 0 L 54 0 Q 64 0 64 10 L 64 62 L 0 62 L 0 10 Q 0 0 10 0 Z"
        fill="url(#kg)"
      />

      {/* Receipt content lines */}
      <Rect x="10" y="22" width="44" height="2.5" rx="1.25" fill="rgba(255,255,255,0.55)" />
      <Rect x="10" y="32" width="32" height="2.5" rx="1.25" fill="rgba(255,255,255,0.35)" />
      <Rect x="10" y="42" width="22" height="2.5" rx="1.25" fill="rgba(255,255,255,0.2)" />

      {/* Teeth at bottom of receipt */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
        <Rect key={i} x={i * 8 + 1} y={62} width={6} height={10} rx={3} fill={Colors.purpleDark} />
      ))}

      {/* Amber badge — dark ring creates separation from body */}
      <Circle cx={58} cy={12} r={13} fill={Colors.background} />
      <Circle cx={58} cy={12} r={10} fill={Colors.amber} />
      {/* Checkmark */}
      <Path
        d="M 52 12 L 56.5 17 L 65 6"
        stroke={Colors.navy}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  )
}
