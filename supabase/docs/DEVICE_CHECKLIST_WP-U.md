# WP-U device checklist — the manual keyboard & mobile audit (~1 hour)

This is the companion the lint config promised: automated checks are now at
**zero warnings with the accessibility rules enforced as errors**, but
conformance is claimed from *using* the app, not from lint. Work through this
on your Mac (keyboard only — no mouse for §1–§4) and then on your iPhone.
Check each box; anything that fails, screenshot it and note the step number —
those become the fix list.

**Setup:** run the latest build (after the next rebuild+push, use klimr.com;
before that, this checklist still works against production for everything
except the photo-reorder arrows and dialog Escape, which ride the rebuild).
On Mac, put the mouse out of reach. macOS: System Settings → Keyboard →
"Keyboard navigation" ON, or Tab won't reach every control in Safari.

## 1. Dialogs (the rebuilt trio + palette) — keyboard only
- [ ] Open your own avatar (profile → click… wait, no mouse: Tab to your
      avatar button, press Enter). The lightbox opens.
- [ ] Press **Escape**. It closes. Reopen; Tab reaches the ✕ Close button;
      Enter closes it.
- [ ] Tournament page → Tab to "Join waitlist", Enter. Escape closes it.
      Reopen; Tab moves through the form fields in a sensible order.
- [ ] Admin → staff actions log → Tab to a row, Enter opens the detail
      dialog. Escape closes.
- [ ] Press **⌘K** (command palette). Type something; arrow through results;
      Escape closes.
- [ ] With each dialog open, click the dark backdrop **with the trackpad
      once** (mouse allowed for this line only): it closes. That's the
      pointer path; Escape is the keyboard path.

## 2. Photo reordering — the new Move buttons
- [ ] Marketplace → create/edit a listing → add 3+ photos. Tab to a
      thumbnail's **‹ ›** buttons (they appear on focus, not just hover) and
      reorder with Enter. First photo's ‹ and last photo's › are disabled.
- [ ] Tournament gallery editor: same check.
- [ ] Gallery editor → open **Crop** on a photo. Tab to the crop stage (it
      shows a focus ring), nudge with **arrow keys**, bigger steps with
      **Shift+arrows**. Tab to the Zoom slider; arrows adjust it.

## 3. Courts finder — cards as real controls
- [ ] /courts → Tab into the results list. Each card's **name** is focusable;
      focusing it highlights the matching map pin (the hover behavior, now
      with keyboard parity). Enter selects the card.
- [ ] The Sport dropdown: Tab to it, Enter opens, type to filter, Enter picks.

## 4. Forms — the 100 relabeled fields (spot-check with VoiceOver)
- [ ] Turn on VoiceOver (⌘F5). Tournament settings editor: land on
      "Tournament name", "Capacity", "Starts" — VoiceOver announces the
      FIELD NAME with each input, not just "edit text".
- [ ] Onboarding phone field announces "Phone".
- [ ] One Segmented chooser (Entry type): VoiceOver announces the group's
      purpose and the selected option.
- [ ] Feed composer → audience dropdown: opens, and clicking elsewhere on
      the page closes it (the outside-close now works properly).

## 5. iPhone pass (~15 min)
- [ ] Dialogs: open lightbox + waitlist sheet; backdrop tap closes; the ✕
      is comfortably tappable (44pt target).
- [ ] Photo reorder: the ‹ › buttons appear on tap and work (drag still
      works too).
- [ ] Crop: one-finger pan still drags; pinch is not expected (zoom is the
      slider).
- [ ] 200% zoom (Settings → Accessibility → Display → Larger Text, or
      browser zoom on desktop Safari): tournament settings form reflows
      without horizontal scrolling or clipped controls.

## Recording
Reply with: "checklist: N/26 pass" plus screenshots + step numbers for any
failure. Failures become the fix list for the next batch; a clean run closes
WP-U's manual-audit leg and gets recorded in DESIGN_DECISIONS.
