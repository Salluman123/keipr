// TEMPORARY DIAGNOSTIC: require() (not import) throughout this file, in this
// order, so the error handler installs before anything else runs — Babel
// hoists `import`-derived requires above plain statements, which would defeat
// this ordering if `import` were used here. Revert to the previous
// import-based version once errorHandler.js is removed.
require('./errorHandler')

const { registerRootComponent } = require('expo')
const App = require('./App').default

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App)
