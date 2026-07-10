import React, { useEffect, useRef } from 'react'
import { Animated, Easing } from 'react-native'

interface Props {
  size?: number
  color?: string
}

// Rotating loading ring. Replaces the earlier static-View "spinners" which did
// not animate and made slow network calls look like a frozen app.
export default function Spinner({ size = 20, color = '#FFFFFF' }: Props) {
  const rotation = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [])

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 3,
        borderColor: 'transparent',
        borderTopColor: color,
        transform: [{ rotate: spin }],
      }}
    />
  )
}
