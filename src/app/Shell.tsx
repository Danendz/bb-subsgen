// The frame every screen in the app is drawn into: navigation rail, the work,
// and the numbers beside it.
//
// What it replaces is a 900px centred column under seven equal-weight tabs.
// Seven of anything in a row is a list, not a hierarchy — the thing opened
// daily sat beside the thing opened twice a year, and the widest screen and the
// narrowest got the same layout. So: two groups in a rail, and the aside for
// everything that is worth glancing at and not worth navigating to.
//
// Two breakpoints, in this order on purpose. The aside goes first, because it
// is commentary on the work; the rail collapses to icons second and never
// disappears, because navigation is the last thing a narrow window should lose.
//
// The grid follows `.section-layout` in src/settings/skin.css — the rail-beside-
// pane shape Data, Settings and the popup already use — rather than inventing a
// second one.

import { Aside } from './Aside'
import { LanguagePill } from './LanguagePill'
import {
  ChatIcon,
  DataIcon,
  DictionaryIcon,
  LearnIcon,
  ReviewIcon,
  SettingsIcon,
  VideosIcon,
} from './icons'
import { navigate } from './hooks'
import { useT } from '../i18n/useT'
import type { ComponentChildren, JSX } from 'preact'
import type { MessageKey } from '../i18n/keys'

interface NavItem {
  route: string
  label: MessageKey
  icon: () => JSX.Element
}

/** What you came to do. */
const PRIMARY: readonly NavItem[] = [
  { route: '/', label: 'app.nav.learn', icon: LearnIcon },
  { route: '/review', label: 'app.nav.review', icon: ReviewIcon },
  { route: '/dictionary', label: 'app.nav.dictionary', icon: DictionaryIcon },
  { route: '/chat', label: 'app.nav.chat', icon: ChatIcon },
]

/** What you go looking for: a record, a switch, a backup. */
const SECONDARY: readonly NavItem[] = [
  { route: '/videos', label: 'app.nav.videos', icon: VideosIcon },
  { route: '/settings', label: 'app.nav.settings', icon: SettingsIcon },
  { route: '/data', label: 'app.nav.data', icon: DataIcon },
]

// Active for anything below the item, so a video's own page keeps Videos lit
// rather than dropping the highlight entirely. `/` is exact, or it would match
// every route there is.
function isOn(item: NavItem, route: string): boolean {
  return item.route === '/' ? route === '/' : route.startsWith(item.route)
}

function RailGroup({ items, route }: { items: readonly NavItem[]; route: string }) {
  const { t } = useT()

  return (
    <div class="rail-group">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <a
            key={item.route}
            href={`#${item.route}`}
            class={isOn(item, route) ? 'rail-item on' : 'rail-item'}
            aria-current={isOn(item, route) ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault()
              navigate(item.route)
            }}
          >
            <Icon />
            <span class="rail-label">{t(item.label)}</span>
          </a>
        )
      })}
    </div>
  )
}

export function Shell({
  route,
  aside = true,
  children,
}: {
  route: string
  /** Off for the setup wizard: a first run has no numbers to put beside it. */
  aside?: boolean
  children: ComponentChildren
}) {
  const { t } = useT()

  return (
    <div class={aside ? 'shell' : 'shell solo'}>
      <nav class="rail" aria-label={t('app.nav.label')}>
        {/* The one place the product still says its own name. The page used to
            open with a heading and a tagline above the tabs; a rail can afford
            the name and not the sentence. */}
        <div class="rail-brand">{t('app.title')}</div>
        <LanguagePill />
        <RailGroup items={PRIMARY} route={route} />
        <hr class="rail-rule" />
        <RailGroup items={SECONDARY} route={route} />
      </nav>

      <main class="main">{children}</main>

      {aside && <Aside />}
    </div>
  )
}
