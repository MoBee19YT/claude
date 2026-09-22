# Qompify — frontend demo

A polished, frontend-only demo of **Qompify**, a hardware comparison platform:
a place to discover, compare and understand PC hardware. It is not a shop —
nothing is sold, and there is no cart or checkout anywhere in the interface.

## Running it

No build step and no dependencies. Open `index.html` in a browser, or serve the
folder if you prefer a local server:

```bash
npx serve qompify      # or: python3 -m http.server
```

## What's in the box

| File | Purpose |
| --- | --- |
| `index.html` | Page structure: header, hero, categories, comparisons, guides, footer |
| `styles.css` | Design tokens, components and responsive rules (numbered sections) |
| `app.js` | Placeholder content data + all interactions |
| `assets/*.svg` | Hand-drawn placeholder hardware artwork (no external images) |

Repeating blocks — category cards, comparison cards, "Why Qompify" points and
guide cards — are rendered from arrays at the top of `app.js`, so adding a card
means adding an object, not copying markup.

## Design

- Accent `#3C86CE`, supported by white, very light blue and soft lavender-blue
  surfaces with dark navy text.
- Rounded cards, hairline borders, very subtle shadows, generous whitespace.
- Light and dark themes, both driven by CSS custom properties on `:root`.
- Responsive from 360px up: 7 → 4 → 2 category columns, comparison and guide
  grids collapse, and the nav becomes a menu sheet below 960px.
- Inter via Google Fonts, with a system font fallback if it cannot load.

## Interactions (all visual)

- Search with live suggestions over a local 14-product list, match highlighting,
  arrow-key navigation, `/` to focus and `Esc` to dismiss.
- Theme toggle, remembered in `localStorage`, defaulting to the OS preference.
- Sticky header that gains a border on scroll, plus scroll-spy nav highlighting.
- Hover lifts on cards, staggered reveal-on-scroll, mobile menu, profile menu.
- Every demo-only control shows a short toast saying so.

## Deliberately not included

No backend, database, API calls, scraping, authentication, payments or cart.
Product names, prices, specs and dates are placeholder data written into
`app.js`; the footer says so on the page itself.

Motion is disabled automatically under `prefers-reduced-motion`.
