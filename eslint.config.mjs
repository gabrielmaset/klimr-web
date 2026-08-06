import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { adminGrandfather } from "./eslint-admin-grandfather.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // K1-01 (audit ARCH-001): the raw service-role client is off-limits to NEW
  // code — use lib/privileged (explicit reason + audit event). The frozen
  // grandfather list holds the pre-existing call sites; entries only ever
  // leave it as files migrate. lib/privileged itself and the client factory
  // are the two legitimate importers.
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: [...adminGrandfather, "lib/privileged/**", "lib/supabase/admin.ts"],
    rules: {
      // UX-002: an untyped <button> defaults to type="submit", so one inside a
      // form fires it by accident. Every button now declares intent.
      "react/button-has-type": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/admin",
              message:
                "New code must use getPrivilegedClient from @/lib/privileged (reason + audit). K1-01 — see docs/DESIGN_DECISIONS.md.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
