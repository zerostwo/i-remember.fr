export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".revival-data/**",
      ".revival-storage/**",
      "public/uploads/**",
      "apps/**/dist/**",
      "packages/**/dist/**",
      "apps/**/*.ts",
      "packages/**/*.ts",
      "packages/**/*.d.ts",
      "**/*.jsx",
      "public/**",
      "server.mjs",
      "src/server/**",
    ],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "off",
    },
  },
];
