# Keipr — Claude Code Project Guide

## App Overview
Keipr is a mobile bookkeeping app for freelancers and small business owners.
Built with Expo + React Native + Supabase + Claude API.
Handle: @getkeipr | Domain: keipr.com

## Brand Colors
- Purple Light: #9F67F7
- Purple Dark: #5418C8
- Amber: #F59E0B
- Navy: #1A1A2E
- Background: #0D0D14
- Card: #1A1A2E
- Off White: #F0EEFF

## Fonts
- Georgia for headings and display
- System sans-serif for body text

## Stack
- Expo + React Native (NO Expo Router — pure React Navigation)
- Supabase for auth and database
- Claude API for receipt OCR scanning
- Zustand for state management
- expo-file-system/legacy for file reading
- react-native-svg for charts

## Navigation Structure
- AuthStack: Splash → Onboarding → SignIn / SignUp / ForgotPassword
- MainTabs: Home | Expenses | Reports | Settings
- Modal screens: ScanScreen, ManualEntryScreen

## Critical Rules — NEVER BREAK THESE
1. After ANY Supabase mutation (insert/update/delete), always wait 300ms before refetching:
   setTimeout(() => { fetchExpenses(userId); }, 300);
2. NEVER update local state directly after insert — always refetch from Supabase
3. NEVER use ActivityIndicator without explicit numeric size prop
4. ALWAYS use expo-file-system/legacy not expo-file-system for readAsStringAsync
5. ALWAYS include this header in Claude API calls:
   "anthropic-dangerous-direct-browser-access": "true"
6. NEVER insert columns into Supabase that don't exist in the schema
7. NEVER use fontSize: "large" or any string value for numeric style props

## Environment Variables
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_ANTHROPIC_API_KEY
