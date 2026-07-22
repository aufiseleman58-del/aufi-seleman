import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    files: ['**/*.rules'],
    plugins: {
      'firebase-security': firebaseRulesPlugin,
    },
    languageOptions: {
      parser: firebaseRulesPlugin.parsers.firestore,
    },
    rules: {
      ...firebaseRulesPlugin.configs.recommended.rules,
    },
  },
];
