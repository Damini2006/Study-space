import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import unusedImports from "eslint-plugin-unused-imports";

export default [
  { ignores: ["dist", "node_modules", "coverage", ".vite"] },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      // `jsx-uses-vars` / `jsx-uses-react` are essential: without them ESLint's
      // scope analysis treats every component referenced only from JSX as dead
      // code, and --fix would happily delete it.
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "unused-imports": unusedImports,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // JSX is plain JavaScript here — React 17+ doesn't need the import.
      // JSX counts as a real reference.
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      // Core `no-undef` only inspects plain JS expressions — it never checks
      // `<Foo />` element names, so a missing component import would ship and
      // white-screen at runtime. This rule closes that gap.
      "react/jsx-no-undef": ["error", { allowGlobals: false }],

      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // Catch the class of bug that white-screens a page: a symbol that was
      // never imported or declared. `unused-imports/no-unused-vars` reports the
      // same thing as core `no-unused-vars` but can also auto-remove dead
      // imports with --fix, which core ESLint deliberately refuses to do.
      "no-undef": "error",
      "no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
          ignoreRestSiblings: true,
        },
      ],
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-duplicate-case": "error",
      "no-unreachable": "error",
      "no-constant-binary-expression": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
      "object-shorthand": "off",
    },
  },
  // Tests run in Node with Vitest globals enabled.
  {
    files: ["tests/**/*.{js,jsx}", "*.config.{js,jsx}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
];
