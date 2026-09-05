// The list of sections beside a pane, for the settings tab, the data tab and the
// popup.
//
// Presentational on purpose: it is handed the active slug and a callback, and
// knows nothing about how either is produced. The app tab keeps the section in
// the hash so a section can be linked and survives a reload; the popup has no
// router and holds it in local state. Teaching this component about routing
// would mean teaching it about a router one of its two hosts does not have.
//
// Same markup in both, skinned by each host's stylesheet — the arrangement
// controls.tsx describes, for the same reason.

/** One rail entry. `slug` is what appears in the hash on the app side. */
export interface RailItem<S extends string> {
  slug: S
  label: string
}

export function SectionRail<S extends string>({
  items,
  active,
  onSelect,
}: {
  items: readonly RailItem<S>[]
  active: S
  onSelect: (slug: S) => void
}) {
  return (
    <nav class="panel section-rail" aria-label="Sections">
      {items.map((item) => (
        <div class={`row section-row ${item.slug === active ? 'on' : ''}`} key={item.slug}>
          <button
            class="row-btn grow"
            aria-current={item.slug === active ? 'page' : undefined}
            onClick={() => onSelect(item.slug)}
          >
            {item.label}
          </button>
        </div>
      ))}
    </nav>
  )
}
