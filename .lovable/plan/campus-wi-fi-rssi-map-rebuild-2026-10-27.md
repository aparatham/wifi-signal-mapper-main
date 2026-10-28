# Campus Wi-Fi RSSI Map Rebuild

## User experience

- Replace the navigation and route-planning prototype with a campus Wi-Fi signal map at `/`.
- Let anyone browse the five TKM buildings and their floor levels, choose a floor, and view its RSSI measurement points and interpolated heatmap.
- Let only signed-in developers add, drag to adjust, and remove points. Each point stores its building, floor, map position, RSSI dBm value, and measurement time.
- Use the uploaded campus boundary/building footprints as a schematic campus map. No indoor floor-plan drawings were included, so floor selection filters data rather than pretending a floor drawing exists.

## Access and data

- Use Lovable Cloud Auth for developer sign-in; do not collect user profile fields or offer public signup.
- Store developer privileges in a separate protected user-roles table; never trust browser storage or account metadata for edit access.
- Store measurements in Cloud and allow public read-only access, while writes and deletes require the developer role through row-level security.
- Show a clear sign-in prompt for edit actions by visitors, and a read-only map otherwise.

## Technical approach

- Keep the requested experience on the existing TanStack Start home route and provide route-specific sharing metadata.
- Use an interactive SVG campus schematic and client-side heatmap interpolation so map point placement and adjustment work without GPS or navigation logic.
- Add Cloud schema through a migration with explicit Data API grants and policies; generate updated database types afterwards.
- Add focused tests for RSSI point validation and developer-only write permissions where the current test setup allows.
- Record the durable application-structure decisions in `AGENTS.md` and close out the root roadmap.
