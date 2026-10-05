import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

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
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // JSX is plain JavaScript here — React 17+ doesn't need the import.
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // Catch the class of bug that white-screens a page: a symbol that was
      // never imported or declared.
      "no-undef": "error",
      "no-unused-vars": [
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
