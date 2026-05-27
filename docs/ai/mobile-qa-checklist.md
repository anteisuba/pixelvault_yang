# PixelVault Mobile QA Checklist

Use this checklist after mobile-visible UI work. Desktop emulation is useful, but it does not prove mobile keyboard behavior.

## Simulated Checks

Run Playwright mobile checks when the app can start locally:

```bash
npx playwright test e2e/mobile.spec.ts --project=mobile
```

Use `http://localhost:3000` as the canonical local QA origin. Do not use the
loopback IP host on port 3000 for browser or mobile QA.

For responsive visual review, inspect these widths:

- 375px
- 390px
- 430px
- 768px
- 1024px
- 1440px

Collect objective evidence before calling a page broken:

- current URL
- visible text length
- `document.documentElement.scrollWidth`
- `window.innerWidth`
- console errors
- page errors
- screenshot only after the page has settled

## Real Devices

Required devices before shipping keyboard-sensitive UI:

- iPhone Safari
- Android Chrome

## Generation Flow

1. Open the Studio generation page.
2. Tap the prompt textarea.
3. Confirm the keyboard appears.
4. Confirm the textarea remains visible.
5. Confirm the primary generation button remains reachable or has a reachable replacement.
6. Enter a long prompt.
7. Scroll while the keyboard is open.
8. Switch model or settings if those controls are part of the edited surface.
9. Open and close modal, drawer, or bottom sheet controls.
10. Rotate between portrait and landscape if the layout supports it.
11. Confirm no horizontal scroll appears.

## Gallery Flow

1. Open gallery on mobile.
2. Scroll through several rows.
3. Open a generation detail.
4. Close the detail view.
5. Confirm grid columns, image aspect ratios, and metadata remain stable.
6. Confirm long titles and translated labels do not overflow.

## Auth Flow

1. Open sign-in on mobile.
2. Focus each input field.
3. Confirm labels, helper text, and submit buttons are not covered by the keyboard.
4. Confirm Clerk surfaces do not create horizontal scroll.

## Severity

- Critical: user cannot complete a core task.
- High: a main flow is blocked.
- Medium: flow can be completed, but the experience is poor or confusing.
- Low: polish, clarity, or minor visual quality issue.

Classify local compile delay, font loading, OS browser chrome, network transient, missing login, and missing secrets as environment issues unless source inspection shows an application bug.
