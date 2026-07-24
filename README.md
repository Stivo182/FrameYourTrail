# Frame Your Trail

Frame Your Trail is a browser app for turning GPX, TCX, FIT, and supported
GPX-like XML route files into printable trail posters.

<p align="center">
  <img
    src="docs\screenshots\poster-preview-desktop.jpg"
    alt="Frame Your Trail poster preview"
    width="600"
  >
</p>

## Highlights

- Local file import with browser-only parsing and rendering.
- Poster preview with map, elevation profile, and key route metrics.
- Export to PNG, JPEG, PDF, or the clipboard.
- Optional live map styles, speed-colored routes, and location subtitle when
  route data and network access allow it.

## Privacy

Route files stay in the browser. The app does not require accounts, backend
storage, or file uploads. Network access is only used for optional map style
JSON and map tiles, best-effort BigDataCloud reverse geocoding, and explicitly
enabled terrain elevation lookup. After a valid route is analyzed, the location
lookup requests one representative route coordinate to show a region/country
subtitle when available.

## Quick Start

Requirements: Node.js 22+ and npm.

```powershell
npm ci
npm run dev
```

The dev server runs at:

```text
http://127.0.0.1:5173/
```

## Using The App

Load a GPX, TCX, FIT, or supported GPX-like XML route file through the picker or
by dropping it on the empty state, review the poster, adjust available options,
and export the result.

## Development

On a fresh environment, install the Playwright Chromium browser once:

```powershell
npx playwright install chromium
```

Run the full verification suite:

```powershell
npm run verify
```

Common focused checks:

```powershell
npm run test
npm run build
npm run test:e2e
npm run test:a11y
npm run test:visual
```

Normal tests use pinned offline OpenFreeMap fixtures, and normal app use remains
network-optional. To compare those contracts with the live provider style and
current vector tiles, run the opt-in network check:

```powershell
npm run test:map-contract:live
```

Preview a production build locally:

```powershell
npm run build
npm run preview
```

Production preview defaults to `http://127.0.0.1:4173/FrameYourTrail/`, matching
the canonical GitHub Pages path from `site.config.json`. Set `VITE_BASE_PATH=/`
for a root-hosted production build.

## Documentation

`docs/product-spec.md` is the source of truth for product behavior,
architecture, deployment, and verification details.
