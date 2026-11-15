# Calm, bold app: plan

Goal: the Android app shows only what each person needs, with bold type, the design file's icons and motion, and a
proper opening animation. Source: `wise-design-dna` skill (calm content, typography, icons, motion references).

## 1. Show less (content budget)
- One job and one accent button per screen. Titles ≤ 7 words, one supporting sentence, lists of 3–5 then "See all".
- The More menu never repeats a tab. "Waiting to send" appears only when something is waiting.
- Accountant (too many screens): tabs become **Home · Collect · Proofs · More** (Bills tab removed). More keeps only
  **Who owes**, **Expenses**, **Notices**, then account settings. Payroll and the bills list leave the phone; they
  stay on the website, where that work is done.
- Home screens: the one number that matters first (large), at most 4 tiles, the main action, then short lists.

## 2. Bold typography
- Every screen title uses the heavy display face (one display line per screen), big numbers too.
- Inter SemiBold for section titles, buttons and links; body stays Regular in the softer secondary colour.

## 3. Icons
- Replace Ionicons with Lucide at the design file's spec: 2px stroke, flat (butt) ends, sharp (miter) joins.
- One `Icon` component with the app's names, so every screen uses the same set.

## 4. Motion
- Tabs: short drift + fade (Expo Router `shift`, emphasized curve). Stack screens: quick crossfade.
- Sheets slide up in 150ms. Loading shows shaped skeletons instead of a bare spinner.
- Opening animation: deep brand screen, the brand mark launches upward (1000ms hard ease-in, scale 0.8 → 1.7), then a
  200ms curtain reveal. Skipped when Android "Remove animations" is on.

## 5. Check
- Typecheck, all app tests (navigation tests updated for the new accountant tabs), release APK.
