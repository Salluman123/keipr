import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/AuthStack'
import { Colors } from '../../constants/colors'
import { useAuthStore } from '../../store/authStore'

const Spinner = ({ size = 20, color = '#FFFFFF' }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: 'transparent', borderTopColor: color }} />
)

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>
}

export default function ForgotPasswordScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets()
  const resetPassword = useAuthStore((s) => s.resetPassword)

  const [email, setEmail] = useState('')
  const [emailFocused, setEmailFocused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSend = async () => {
    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await resetPassword(email.trim().toLowerCase())
      setSent(true)
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
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
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.offWhite} />
        </TouchableOpacity>

        {sent ? (
          <SuccessState email={email} onBack={() => navigation.navigate('SignIn')} />
        ) : (
          <>
            <View style={styles.iconContainer}>
              <LinearGradient
                colors={[Colors.purpleLight, Colors.purpleDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconGradient}
              >
                <Ionicons name="key-outline" size={32} color={Colors.white} />
              </LinearGradient>
            </View>

            <Text style={styles.heading}>Reset Password</Text>
            <Text style={styles.subheading}>
              Enter your email and we'll send you a link to reset your password.
            </Text>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email Address</Text>
                <View style={[styles.inputWrapper, emailFocused && styles.inputWrapperFocused]}>
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
                    returnKeyType="done"
                    onSubmitEditing={handleSend}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                  />
                </View>
              </View>

              {!!error && <Text style={styles.errorText}>{error}</Text>}

              <TouchableOpacity
                onPress={handleSend}
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
                    <Text style={styles.ctaText}>Send Reset Link</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.backToSignIn} onPress={() => navigation.goBack()}>
              <Text style={styles.backToSignInText}>Back to Sign In</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function SuccessState({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <View style={successStyles.container}>
      <View style={successStyles.iconContainer}>
        <LinearGradient
          colors={[Colors.success, '#059669']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={successStyles.iconGradient}
        >
          <Ionicons name="checkmark-outline" size={40} color={Colors.white} />
        </LinearGradient>
      </View>
      <Text style={successStyles.title}>Check your email</Text>
      <Text style={successStyles.body}>
        We sent a password reset link to{' '}
        <Text style={successStyles.emailHighlight}>{email}</Text>
        {'. Open the link to set a new password.'}
      </Text>
      <Text style={successStyles.note}>
        Didn't receive it? Check your spam folder or wait a minute before trying again.
      </Text>
      <TouchableOpacity onPress={onBack} activeOpacity={0.85} style={successStyles.ctaWrapper}>
        <LinearGradient
          colors={[Colors.purpleLight, Colors.purpleDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={successStyles.ctaButton}
        >
          <Text style={successStyles.ctaText}>Back to Sign In</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
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
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    marginBottom: 32,
  },
  iconGradient: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontSize: 30,
    fontFamily: 'Georgia',
    color: Colors.offWhite,
    marginBottom: 12,
  },
  subheading: {
    fontSize: 15,
    color: Colors.gray,
    lineHeight: 22,
    marginBottom: 40,
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
  errorText: {
    fontSize: 13,
    color: Colors.error,
    textAlign: 'center',
  },
  ctaWrapper: {},
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
  backToSignIn: {
    alignItems: 'center',
    marginTop: 28,
  },
  backToSignInText: {
    fontSize: 14,
    color: Colors.gray,
  },
})

const successStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 40,
    alignItems: 'flex-start',
  },
  iconContainer: {
    marginBottom: 32,
  },
  iconGradient: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 30,
    fontFamily: 'Georgia',
    color: Colors.offWhite,
    marginBottom: 16,
  },
  body: {
    fontSize: 16,
    color: Colors.grayLight,
    lineHeight: 24,
    marginBottom: 16,
  },
  emailHighlight: {
    color: Colors.purpleLight,
    fontWeight: '600',
  },
  note: {
    fontSize: 13,
    color: Colors.gray,
    lineHeight: 20,
    marginBottom: 40,
  },
  ctaWrapper: {
    width: '100%',
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
})
