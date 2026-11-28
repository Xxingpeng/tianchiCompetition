import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // 入口跑在 Deno 里、由平台独立校验；Node 侧的 tsc/eslint 不覆盖它。
  { ignores: ["dist/**", "coverage/**", "node_modules/**", "public/**", "functions/index.ts"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // 目录缺件、资产 404 这类问题要能在控制台看见，但不允许把调试输出带进发布页
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  prettier,
);
