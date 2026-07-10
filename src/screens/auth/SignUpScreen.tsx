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
import type { AccountType } from '../../types'

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'SignUp'>
}

const ACCOUNT_TYPES: { id: AccountType; label: string }[] = [
  { id: 'personal', label: 'Personal' },
  { id: 'freelancer', label: 'Freelancer' },
  { id: 'business', label: 'Business' },
]

export default function SignUpScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets()
  const signUp = useAuthStore((s) => s.signUp)
  const signInWithApple = useAuthStore((s) => s.signInWithApple)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [accountType, setAccountType] = useState<AccountType>('freelancer')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmationSent, setConfirmationSent] = useState(false)

  const [nameFocused, setNameFocused] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)

  const emailRef = useRef<TextInput>(null)
  const passwordRef = useRef<TextInput>(null)

  const handleSignUp = async () => {
    if (!fullName.trim()) {
      setError('Please enter your full name.')
      return
    }
    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const needsConfirmation = await signUp(email.trim().toLowerCase(), password, fullName.trim(), accountType)
      if (needsConfirmation) {
        // No session yet — the account exists but the user must confirm their
        // email first. Without this state the screen would just sit there.
        setConfirmationSent(true)
      }
      // Otherwise onAuthStateChange fires SIGNED_IN and the app navigates itself.
    } catch (e: any) {
      setError(e?.message ?? 'Sign up failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleAppleSignIn = async () => {
    const startedAt = Date.now()
    try {
      await signInWithApple()
    } catch (e: any) {
      // Instant ERR_REQUEST_CANCELED = the sheet failed to present (iPad bug) →
      // surface it. A late one = genuine user cancel → stay silent.
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

        {confirmationSent ? (
          <View style={styles.confirmBox}>
            <Text style={styles.heading}>Check your email</Text>
            <Text style={styles.confirmBody}>
              We sent a confirmation link to{' '}
              <Text style={styles.confirmEmail}>{email.trim().toLowerCase()}</Text>
              {'. Open it to activate your account, then sign in.'}
            </Text>
            <Text style={styles.confirmNote}>
              Didn't receive it? Check your spam folder or wait a minute before trying again.
            </Text>
            <TouchableOpacity onPress={() => navigation.push('SignIn')} activeOpacity={0.85}>
              <LinearGradient
                colors={[Colors.purpleLight, Colors.purpleDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaButton}
              >
                <Text style={styles.ctaText}>Go to Sign In</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
        <>
        <Text style={styles.heading}>Create Account</Text>
        <Text style={styles.subheading}>Join thousands of freelancers & small businesses</Text>

        <View style={styles.form}>
          {/* Full Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name</Text>
            <View style={[styles.inputWrapper, nameFocused && styles.inputWrapperFocused]}>
              <Ionicons
                name="person-outline"
                size={18}
                color={nameFocused ? Colors.purpleLight : Colors.gray}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Jane Smith"
                placeholderTextColor={Colors.gray}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
              />
            </View>
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={[styles.inputWrapper, emailFocused && styles.inputWrapperFocused]}>
              <Ionicons
                name="mail-outline"
                size={18}
                color={emailFocused ? Colors.purpleLight : Colors.gray}
                style={styles.inputIcon}
              />
              <TextInput
                ref={emailRef}
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
            <Text style={styles.label}>Password</Text>
            <View style={[styles.inputWrapper, passwordFocused && styles.inputWrapperFocused]}>
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
                placeholder="Minimum 8 characters"
                placeholderTextColor={Colors.gray}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleSignUp}
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

          {/* Account Type */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Account Type</Text>
            <View style={styles.pillRow}>
              {ACCOUNT_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.id}
                  style={[
                    styles.pill,
                    accountType === type.id && styles.pillActive,
                  ]}
                  onPress={() => setAccountType(type.id)}
                  activeOpacity={0.75}
                >
                  {accountType === type.id ? (
                    <LinearGradient
                      colors={[Colors.purpleLight, Colors.purpleDark]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.pillGradient}
                    >
                      <Text style={styles.pillTextActive}>{type.label}</Text>
                    </LinearGradient>
                  ) : (
                    <Text style={styles.pillText}>{type.label}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Error */}
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {/* CTA */}
          <TouchableOpacity
            onPress={handleSignUp}
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
                <Text style={styles.ctaText}>Create Account</Text>
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
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={16}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
          </>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.push('SignIn')}>
            <Text style={styles.footerLink}>Sign In</Text>
          </TouchableOpacity>
        </View>
        </>
        )}
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
    lineHeight: 22,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.grayLight,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
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
  pillRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pill: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.inputBg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  pillActive: {
    borderColor: 'transparent',
  },
  pillGradient: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  pillText: {
    fontSize: 14,
    color: Colors.gray,
    fontWeight: '500',
    paddingVertical: 11,
  },
  pillTextActive: {
    fontSize: 14,
    color: Colors.white,
    fontWeight: '700',
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
  confirmBox: {
    gap: 16,
    paddingTop: 8,
  },
  confirmBody: {
    fontSize: 15,
    color: Colors.grayLight,
    lineHeight: 23,
  },
  confirmEmail: {
    color: Colors.purpleLight,
    fontWeight: '600',
  },
  confirmNote: {
    fontSize: 13,
    color: Colors.gray,
    lineHeight: 19,
    marginBottom: 8,
  },
})
