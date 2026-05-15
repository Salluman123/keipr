import React, { useRef, useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ViewToken,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/AuthStack'
import { Colors } from '../../constants/colors'

const { width } = Dimensions.get('window')

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Onboarding'>
}

interface Slide {
  id: string
  iconName: keyof typeof Ionicons.glyphMap
  iconColors: readonly [string, string]
  title: string
  description: string
}

const SLIDES: Slide[] = [
  {
    id: '1',
    iconName: 'scan-outline',
    iconColors: [Colors.purpleLight, Colors.purpleDark],
    title: 'Scan any receipt',
    description:
      'Point your camera at any receipt and Keipr extracts the merchant, amount, and date automatically.',
  },
  {
    id: '2',
    iconName: 'stats-chart-outline',
    iconColors: ['#F59E0B', '#D97706'],
    title: 'Track every expense',
    description:
      'Categorize expenses, monitor spending patterns, and stay on top of your cash flow in real time.',
  },
  {
    id: '3',
    iconName: 'cloud-download-outline',
    iconColors: [Colors.purpleLight, Colors.purpleDark],
    title: 'Export anytime',
    description:
      'Generate professional expense reports and export to PDF or CSV with a single tap — tax time made simple.',
  },
]

export default function OnboardingScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets()
  const flatListRef = useRef<FlatList<Slide>>(null)
  const [currentIndex, setCurrentIndex] = useState(0)

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        setCurrentIndex(viewableItems[0].index ?? 0)
      }
    },
    [],
  )

  const goNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true })
    } else {
      navigation.replace('SignIn')
    }
  }

  const skip = () => navigation.replace('SignIn')

  const renderSlide = ({ item }: { item: Slide }) => (
    <View style={styles.slide}>
      <View style={styles.iconContainer}>
        <LinearGradient
          colors={item.iconColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconGradient}
        >
          <Ionicons name={item.iconName} size={56} color={Colors.white} />
        </LinearGradient>
      </View>
      <Text style={styles.slideTitle}>{item.title}</Text>
      <Text style={styles.slideDescription}>{item.description}</Text>
    </View>
  )

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Skip */}
      <TouchableOpacity style={styles.skipButton} onPress={skip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        scrollEventThrottle={16}
        style={styles.flatList}
      />

      {/* Bottom area */}
      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        {/* Dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === currentIndex ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity onPress={goNext} activeOpacity={0.85}>
          <LinearGradient
            colors={[Colors.purpleLight, Colors.purpleDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaButton}
          >
            <Text style={styles.ctaText}>
              {currentIndex === SLIDES.length - 1 ? 'Get Started' : 'Next'}
            </Text>
            {currentIndex < SLIDES.length - 1 && (
              <Ionicons name="arrow-forward" size={18} color={Colors.white} style={{ marginLeft: 6 }} />
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  skipButton: {
    position: 'absolute',
    top: 16,
    right: 24,
    zIndex: 10,
    paddingVertical: 8,
  },
  skipText: {
    color: Colors.grayLight,
    fontSize: 15,
  },
  flatList: {
    flex: 1,
  },
  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingTop: 40,
  },
  iconContainer: {
    marginBottom: 40,
  },
  iconGradient: {
    width: 120,
    height: 120,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideTitle: {
    fontSize: 28,
    fontFamily: 'Georgia',
    color: Colors.offWhite,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 36,
  },
  slideDescription: {
    fontSize: 16,
    color: Colors.grayLight,
    textAlign: 'center',
    lineHeight: 24,
  },
  bottomArea: {
    paddingHorizontal: 24,
    paddingTop: 16,
    alignItems: 'center',
    gap: 20,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
    backgroundColor: Colors.purpleLight,
  },
  dotInactive: {
    width: 8,
    backgroundColor: Colors.border,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    borderRadius: 16,
    width: width - 48,
  },
  ctaText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
})
