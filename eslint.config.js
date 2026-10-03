// Minimal lint setup: `npx eslint .` (ESLint 9+). Catches undefined names and dead code.
export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', console: 'readonly', performance: 'readonly', requestAnimationFrame: 'readonly',
        setTimeout: 'readonly', localStorage: 'readonly', indexedDB: 'readonly', globalThis: 'readonly', Blob: 'readonly', Response: 'readonly',
        CompressionStream: 'readonly', DecompressionStream: 'readonly', URL: 'readonly', ResizeObserver: 'readonly', Path2D: 'readonly',
        FormData: 'readonly', Event: 'readonly', btoa: 'readonly', atob: 'readonly', Intl: 'readonly', process: 'readonly', fetch: 'readonly', Buffer: 'readonly', DOMMatrix: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none' }],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-self-assign': 'error',
    },
  },
  { ignores: ['node_modules/', 'tools/.cache/'] },
];
