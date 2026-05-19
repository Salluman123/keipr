import React, { useEffect, useRef } from 'react'
import { View, Text, Animated, StyleSheet } from 'react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/AuthStack'
import { Colors } from '../../constants/colors'
import KeiprIcon from '../../components/KeiprIcon'

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Splash'>
}

export default function SplashScreen({ navigation }: Props) {
  const opacity = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(0.82)).current
  const taglineOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 7,
          tension: 35,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 500,
        delay: 100,
        useNativeDriver: true,
      }),
    ]).start()

    const timer = setTimeout(() => {
      navigation.replace('Onboarding')
    }, 2600)

    return () => clearTimeout(timer)
  }, [])

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.logoWrapper, { opacity, transform: [{ scale }] }]}>
        <View style={styles.iconWrap}>
          <KeiprIcon size={80} />
        </View>

        <Animated.Text style={[styles.wordmark, { opacity: taglineOpacity }]}>
          Keipr
        </Animated.Text>
        <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
          Bookkeeping made effortless
        </Animated.Text>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrapper: {
    alignItems: 'center',
  },
  iconWrap: {
    marginBottom: 24,
  },
  wordmark: {
    fontSize: 38,
    fontFamily: 'Georgia',
    color: Colors.offWhite,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  tagline: {
    fontSize: 14,
    color: Colors.gray,
    letterSpacing: 0.4,
  },
})
