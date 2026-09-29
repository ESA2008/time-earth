# TIME EARTH — Modified Existing Project

This package preserves the existing TIME EARTH project and adds the missing Explorer functionality instead of replacing the design.

## Files
- `index.html`, `script.js`, `style.css`: existing main Earth/globe experience, preserved.
- `explorer.html`, `explorer.js`, `explorer.css`: existing Place Explorer, modified in-place.
- `earth-intelligence.js`: existing NASA POWER system, modified only to synchronize with the Explorer observation date.

## Added functionality
- NASA GIBS observation-date resolution from GetCapabilities
- Timeline date synchronization
- NASA POWER reload for the selected timeline year/date
- Before/After imagery with draggable swipe
- Overlay mode and per-layer opacity
- What am I looking at? layer explanation
- Administrative ADM1 boundary matching
- Working Earth Story playback
- Return-to-location control
- Improved unavailable-observation feedback

## Important
The app still uses the original NASA GIBS, NASA POWER, Leaflet, and existing UI structure. Internet access is required when running it because the NASA and boundary services are remote.

## Location URL
The Explorer accepts the existing parameters: `name`, `region`, `country`, `lat`, `lon`. It also accepts optional `countryCode` or `iso3` for faster administrative-boundary lookup.
