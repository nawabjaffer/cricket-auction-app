/** Lint config for the Android app (ESLint 8 + @react-native). Run with `npm run lint`. */
module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['android/', 'node_modules/', 'coverage/'],
  rules: {
    // Screens use small one-off layout tweaks; shared tokens live in src/ui/theme.ts.
    'react-native/no-inline-styles': 'off',
    // `void promise()` marks a deliberately un-awaited call (also inside arrow bodies).
    'no-void': 'off',
  },
  overrides: [
    {
      // The tests feed hostile URLs (javascript:, file:) to the validators.
      files: ['__tests__/**/*.ts'],
      rules: { 'no-script-url': 'off' },
    },
    {
      // Stream keys / URLs are validated against control characters on purpose.
      files: ['src/shared/**/*.ts', 'src/services/destinations.ts'],
      rules: { 'no-control-regex': 'off' },
    },
  ],
};
