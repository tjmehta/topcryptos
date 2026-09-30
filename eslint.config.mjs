import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Snapshot cache: gitignored, but 414 files from 2020-2021 are still
      // tracked and it also holds a Python venv. Not project source.
      ".cache/**",
      // Build output and committed data dumps, not hand-written source.
      "dist/**",
      "scripts/dist/**",
      "coverage/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // A leading underscore marks a binding that is deliberately unused, such as
    // a parameter kept to satisfy a call signature.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Tests hand partial fixtures, mocks and hand-built responses to typed
    // APIs; `any` there is a fixture convenience, not a production type hole.
    // Production code keeps the preset's error level for this rule.
    files: ["**/__tests__/**", "**/*.test.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    // Research and cron scripts are CommonJS on purpose; require() is correct there.
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];

export default eslintConfig;
