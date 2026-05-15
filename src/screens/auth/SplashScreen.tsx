import React, { useEffect, useRef } from 'react'
import { View, Text, Animated, StyleSheet, Dimensions } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/AuthStack'
import { Colors } from '../../constants/colors'

const { width } = Dimensions.get('window')

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
        <View style={styles.receiptOuter}>
          <LinearGradient
            colors={[Colors.purpleLight, Colors.purpleDark]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.receiptGradient}
          >
            <Text style={styles.kLetter}>K</Text>
          </LinearGradient>

          {/* Receipt serration strip */}
          <View style={styles.serrationRow}>
            {Array.from({ length: 7 }).map((_, i) => (
              <View key={i} style={styles.serrationTooth} />
            ))}
          </View>

          {/* Amber badge */}
          <View style={styles.amberBadge}>
            <Text style={styles.badgeText}>$</Text>
          </View>
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

const RECEIPT_W = 88
const RECEIPT_H = 100
const TOOTH_W = Math.floor(RECEIPT_W / 7)

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
  receiptOuter: {
    width: RECEIPT_W,
    marginBottom: 28,
  },
  receiptGradient: {
    width: RECEIPT_W,
    height: RECEIPT_H,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kLetter: {
    fontSize: 46,
    fontFamily: 'Georgia',
    color: Colors.white,
    fontWeight: '700',
  },
  serrationRow: {
    flexDirection: 'row',
    width: RECEIPT_W,
    overflow: 'hidden',
  },
  serrationTooth: {
    width: TOOTH_W,
    height: 8,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: Colors.purpleDark,
    marginHorizontal: 1,
  },
  amberBadge: {
    position: 'absolute',
    top: -10,
    right: -10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: Colors.background,
  },
  badgeText: {
    fontSize: 13,
    color: Colors.navy,
    fontWeight: '800',
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
