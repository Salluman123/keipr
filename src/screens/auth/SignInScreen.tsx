import React, { useState, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Alert,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import * as AppleAuthentication from 'expo-apple-authentication'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/AuthStack'
import { Colors } from '../../constants/colors'
import { useAuthStore } from '../../store/authStore'
import KeiprIcon from '../../components/KeiprIcon'
import Spinner from '../../components/Spinner'

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'SignIn'>
}

export default function SignInScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets()
  const signIn = useAuthStore((s) => s.signIn)
  const signInWithApple = useAuthStore((s) => s.signInWithApple)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const passwordRef = useRef<TextInput>(null)

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await signIn(email.trim().toLowerCase(), password)
    } catch (e: any) {
      setError(e?.message ?? 'Sign in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleAppleSignIn = async () => {
    const startedAt = Date.now()
    try {
      await signInWithApple()
    } catch (e: any) {
      // ERR_REQUEST_CANCELED covers two very different cases:
      //  - the Apple sheet failed to present at all (iPad compatibility-mode bug)
      //    → the error arrives near-instantly → must be surfaced;
      //  - the user deliberately dismissed the sheet → arrives after they
      //    interacted with it → showing "Sign In Failed" would be wrong.
      // Distinguish them by how quickly the error came back.
      const isCancelled = e?.code === 'ERR_REQUEST_CANCELED'
      if (isCancelled && Date.now() - startedAt > 1000) return
      Alert.alert(
        'Sign In Failed',
        isCancelled
          ? 'Sign in with Apple could not be completed. Please try again or use email and password.'
          : (e?.message ?? 'Apple sign in failed. Please try again.'),
      )
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo mark */}
        <View style={styles.logoRow}>
          <KeiprIcon size={52} />
        </View>

        <Text style={styles.heading}>Welcome back</Text>
        <Text style={styles.subheading}>Sign in to your Keipr account</Text>

        {/* Form */}
        <View style={styles.form}>
          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <View
              style={[
                styles.inputWrapper,
                emailFocused && styles.inputWrapperFocused,
              ]}
            >
              <Ionicons
                name="mail-outline"
                size={18}
                color={emailFocused ? Colors.purpleLight : Colors.gray}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={Colors.gray}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Password</Text>
              <TouchableOpacity onPress={() => navigation.push('ForgotPassword')}>
                <Text style={styles.forgotLink}>Forgot password?</Text>
              </TouchableOpacity>
            </View>
            <View
              style={[
                styles.inputWrapper,
                passwordFocused && styles.inputWrapperFocused,
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={passwordFocused ? Colors.purpleLight : Colors.gray}
                style={styles.inputIcon}
              />
              <TextInput
                ref={passwordRef}
                style={[styles.input, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.gray}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={Colors.gray}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Error */}
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {/* CTA */}
          <TouchableOpacity
            onPress={handleSignIn}
            disabled={loading}
            activeOpacity={0.85}
            style={styles.ctaWrapper}
          >
            <LinearGradient
              colors={[Colors.purpleLight, Colors.purpleDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.ctaButton, loading && { opacity: 0.7 }]}
            >
              {loading ? (
                <Spinner size={20} color={Colors.white} />
              ) : (
                <Text style={styles.ctaText}>Sign In</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {Platform.OS === 'ios' && (
          <>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={16}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
          </>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.push('SignUp')}>
            <Text style={styles.footerLink}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  logoRow: {
    marginBottom: 32,
  },
  heading: {
    fontSize: 30,
    fontFamily: 'Georgia',
    color: Colors.offWhite,
    marginBottom: 8,
  },
  subheading: {
    fontSize: 15,
    color: Colors.gray,
    marginBottom: 40,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.grayLight,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  forgotLink: {
    fontSize: 13,
    color: Colors.purpleLight,
    fontWeight: '500',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 16 : 12,
  },
  inputWrapperFocused: {
    borderColor: Colors.purpleLight,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Colors.offWhite,
  },
  eyeButton: {
    paddingLeft: 8,
  },
  errorText: {
    fontSize: 13,
    color: Colors.error,
    textAlign: 'center',
    lineHeight: 18,
  },
  ctaWrapper: {
    marginTop: 8,
  },
  ctaButton: {
    paddingVertical: 17,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  footerText: {
    fontSize: 14,
    color: Colors.gray,
  },
  footerLink: {
    fontSize: 14,
    color: Colors.purpleLight,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: 12,
    color: Colors.gray,
    letterSpacing: 0.5,
  },
  appleButton: {
    height: 52,
    marginTop: 20,
  },
})
