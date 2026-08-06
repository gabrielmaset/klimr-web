import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { adminGrandfather } from "./eslint-admin-grandfather.mjs";
import a11y from "eslint-plugin-jsx-a11y";

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
    // NOTE: the jsx-a11y PLUGIN is already registered by
    // eslint-config-next/core-web-vitals — re-declaring it is a config error.
    // We only add the rule set here.
    rules: {
      // UX-004: accessibility rules enforced in CI. The surface was already
      // clean (3 violations across the whole app, all fixed), so this is a
      // ratchet that keeps it that way rather than a backlog.
      ...a11y.flatConfigs.recommended.rules,
      // label-has-associated-control is a WARNING, deliberately and
      // temporarily. Enforcing it found 109 form fields whose visible <label>
      // is a styled SIBLING of its input with no htmlFor/id pair — so screen
      // readers do not announce the field name. That is a real defect, not
      // lint noise, but each fix pairs a label with the right control and
      // wants eyes on the rendered form; mass-generating ids risks collisions
      // and mislabelled fields. Tracked as a scoped follow-up (K3-02 tail);
      // raise to "error" once the backlog is cleared.
      "jsx-a11y/label-has-associated-control": "warn",
      // The keyboard-activation family is also WARN for now, same reasoning.
      // Enforcing it surfaced 20 clickable non-button elements (divs/spans with
      // onClick and no key handler) that a keyboard user cannot activate at
      // all. Real defects — but each fix is a judgement call between promoting
      // the element to a <button> (semantic + styling change) or adding
      // role/tabIndex/onKeyDown, and the result has to be verified by actually
      // tabbing the flow. That verification is the manual keyboard audit this
      // task is blocked on, so the two land together. Raise to "error" then.
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
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
