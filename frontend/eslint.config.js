import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/* ESLint was absent from this project, and that is how a real crash shipped:
 * Dashboard.jsx called clearAllCandidates() without destructuring it from
 * useApp(), so "Delete All" threw ReferenceError after the user confirmed an
 * irreversible prompt. no-undef catches that for free, and a bundler never
 * will — the reference is only resolved when the handler runs.
 *
 * Deliberately narrow. The point is to catch mistakes that are unambiguously
 * bugs, not to impose a style on ~12k lines of existing code that would produce
 * hundreds of warnings nobody reads. Stylistic rules are off; correctness rules
 * are errors.
 */
export default [
  { ignores: ['dist/**', 'node_modules/**', '.vite/**'] },

  js.configs.recommended,

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // ─── The rules that catch actual bugs ───
      // This is the one that would have caught the Delete All crash.
      'no-undef': 'error',
      'no-unused-vars': ['warn', {
        // Unused function args are common and harmless in event handlers;
        // an unused local is usually a leftover.
        args: 'none',
        // `React` is imported in every component and genuinely unused under the
        // automatic JSX runtime Vite enables. Removing ~30 imports is a separate
        // sweep; flagging them here buries the leftovers that do matter.
        varsIgnorePattern: '^(_|React$)',
        // `catch (_)` is the idiom this codebase uses for a deliberately
        // ignored error. varsIgnorePattern does not cover catch bindings —
        // caughtErrors defaults to 'all', so ten of these were reported as
        // leftovers when they are the convention.
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'warn',   // `${x}` inside a plain '' string
      'require-atomic-updates': 'off',          // noisy on async React handlers

      // Hook rules catch the class of bug that produces stale state and
      // missing-dependency re-render loops.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // ─── Downgraded from js.configs.recommended ───
      // These fire on existing, deliberate code and are not bugs. Leaving them
      // as errors would mean a red lint from day one, which trains everyone to
      // ignore it — the opposite of the point.
      //
      // 21 empty catch blocks: this codebase swallows failures on purpose in
      // places (badge fetches, cleanup). Whether that is wise is a separate
      // argument; it is not a syntax mistake.
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      // Jarvis filters control characters out of speech transcripts on purpose.
      'no-control-regex': 'off',
      // Suggests rethrowing with { cause }. Worth doing, not worth blocking on.
      'preserve-caught-error': 'warn',
      // Caught real mojibake in three emoji regexes — keep it as an error.
      'no-irregular-whitespace': 'error',

      // ─── Off on purpose ───
      // React 17+ JSX transform means React need not be in scope, and this
      // codebase imports it anyway.
      'react/react-in-jsx-scope': 'off',
      // JSX components read as unused vars to the base rule.
      'no-unused-labels': 'error',
    },
  },

  // Test files get the vitest globals.
  {
    files: ['**/*.test.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
];
