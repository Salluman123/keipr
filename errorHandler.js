// TEMPORARY DIAGNOSTIC — delete this file and the require() of it in index.js
// once the real crash cause is found. Not meant to ship.
//
// Installed as the very first thing index.js does, before any other
// require/import, so it can catch a throw triggered as a side effect of
// merely importing another module (e.g. eager native-module resolution),
// not just errors from code we call ourselves. This file intentionally uses
// require() instead of `import` — Babel's ES module transform hoists
// `import`-derived requires above any plain statement in the same file, so
// anything using `import` here could end up running later than intended.
//
// global.ErrorUtils is installed by React Native's own bootstrap
// (InitializeCore) before any app-level file executes, so it's already
// available by the time this runs.
const { Alert } = require('react-native')

if (global.ErrorUtils) {
  const defaultHandler = global.ErrorUtils.getGlobalHandler()

  global.ErrorUtils.setGlobalHandler((error, isFatal) => {
    try {
      const message = (error && error.message) || String(error)
      const stack = (error && error.stack) || '(no stack available)'
      Alert.alert(
        isFatal ? 'Fatal JS Error (diagnostic build)' : 'JS Error (diagnostic build)',
        `${message}\n\n${stack}`,
      )
    } catch {
      // If Alert itself fails this early, there's nothing more we can do here.
    }
    // Deliberately NOT calling defaultHandler(error, isFatal): the default
    // handler is what hands off to expo-updates' ErrorRecovery and terminates
    // the process, which would race the Alert above and likely kill the app
    // before it's visible. Swallowing it keeps the app alive (blank/broken
    // screen behind the alert) so the message can actually be read.
  })
}
