<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application architecture
- Keep the single public campus map at the TanStack `/` route; use Cloud-backed measurement reads with row-level public access and protect edits in database policies, because map browsing is public while editing is developer-only.
- Store developer roles separately from account or profile data and grant them only through owner-controlled role assignment, because client-controlled identity metadata is not a secure permission boundary.
- Keep campus building/floor geometry and measurement validation in a shared browser-safe map-data module, because map display, point editing, and rule tests must use the same coordinate and validation model.

- Keep live survey logic (dead-reckoning walk, 5-scan RSSI sampling, IDW heatmap with building-outline wall loss) in `src/lib/survey.ts`; map units are ~0.5 m, and browser-only APIs (canvas, device sensors) must stay inside effects or event handlers because routes are server-rendered.
