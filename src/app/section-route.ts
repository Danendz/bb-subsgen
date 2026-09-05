// Which section of a tab a hash route names.
//
// The router hands out a raw string (`useRoute` in hooks.ts), so every tab with
// sub-routes parses its own — `/videos/:id` and `/chat/:id` do it with a regex in
// App.tsx. A section rail cannot: the slug has to be checked against the sections
// that exist, because a stale bookmark or a typed URL must land somewhere rather
// than rendering an empty pane beside a rail with nothing lit.
//
// A plain function rather than a hook so it can be tested without a DOM — the
// suite is node-only.

/**
 * The section named by `route`, or the first of `slugs` when it names none.
 *
 * `prefix` is the tab's own route (`/settings`), matched exactly rather than by
 * `startsWith`, so `/settingsomething` is not read as the Settings tab.
 */
export function sectionOf<S extends string>(
  route: string,
  prefix: string,
  slugs: readonly [S, ...S[]],
): S {
  const fallback = slugs[0]
  if (route === prefix) return fallback
  if (!route.startsWith(`${prefix}/`)) return fallback

  const [slug] = route.slice(prefix.length + 1).split('/')
  return slugs.includes(slug as S) ? (slug as S) : fallback
}
