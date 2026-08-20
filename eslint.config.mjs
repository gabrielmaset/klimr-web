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
      // K3-02 tail CLEARED (KFU-017/023, 2026-08-20): the 109-field backlog
      // this comment tracked is fixed — 61 real htmlFor/id wirings (including
      // three labels now pointing at hidden file inputs, so clicking them
      // opens the picker), ~33 duplicate headings over self-labeling widgets
      // (Segmented / DateTimeField carry their own accessible names) converted
      // to <span>, RichTextEditor grew a labelledBy contract, and the rule is
      // now an ERROR exactly as the original note promised. assert "either"
      // because nesting IS programmatic association (HTML spec); PhoneField
      // is declared as a control component (it renders a native <input>).
      "jsx-a11y/label-has-associated-control": ["error", { assert: "either", depth: 3, controlComponents: ["PhoneField"] }],
      // Keyboard-activation family CLEARED (KFU-017/022/023, 2026-08-20) and
      // raised to ERROR as this comment always promised. The 24-site backlog:
      // three hand-rolled dialogs rebuilt on the house backdrop-button pattern
      // with document-level Escape (rich-text-editor precedent); the command
      // palette likewise; two dropdown click-swallows removed (one vestigial,
      // one replaced by a ref-contains outside-closer); courts result cards
      // got a stretched real <button> with focus/blur hover-parity; and the
      // two photo-reorder surfaces gained Move buttons — drag was the ONLY
      // way to reorder before, which was the realest defect in the set. The
      // three remaining drag/drop handlers carry inline justified disables
      // naming their keyboard alternative. The companion manual keyboard
      // audit is docs/DEVICE_CHECKLIST_WP-U.md, delivered the same batch.
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/no-noninteractive-element-interactions": "error",
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
