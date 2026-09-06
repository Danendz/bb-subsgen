import { Data, DATA_SLUGS } from './Data'
import { Dictionary } from './Dictionary'
import { Overview } from './Overview'
import { Review } from './Review'
import { Settings, SETTINGS_SLUGS } from './Settings'
import { SetupWizard } from './SetupWizard'
import { Videos } from './Videos'
import { Chat } from './chat/Chat'
import { navigate, useRoute } from './hooks'
import { sectionOf } from './section-route'
import { LanguageFilter } from '../settings/LanguageFilter'
import { useT } from '../i18n/useT'
import type { MessageKey } from '../i18n/keys'

const TABS: ReadonlyArray<{ route: string; label: MessageKey }> = [
  { route: '/', label: 'app.tab.overview' },
  { route: '/review', label: 'app.tab.review' },
  { route: '/chat', label: 'app.tab.chat' },
  { route: '/dictionary', label: 'app.tab.dictionary' },
  { route: '/videos', label: 'app.tab.videos' },
  { route: '/data', label: 'app.tab.data' },
  { route: '/settings', label: 'app.tab.settings' },
]

function Nav({ route }: { route: string }) {
  const { t } = useT()

  return (
    <nav class="tabs">
      {TABS.map((tab) => (
        <a
          key={tab.route}
          href={`#${tab.route}`}
          // Active for anything below the tab, so a video's own page keeps
          // Videos lit rather than dropping the highlight entirely.
          class={
            tab.route === '/'
              ? route === '/'
                ? 'on'
                : ''
              : route.startsWith(tab.route)
                ? 'on'
                : ''
          }
          onClick={(e) => {
            e.preventDefault()
            navigate(tab.route)
          }}
        >
          {t(tab.label)}
        </a>
      ))}
    </nav>
  )
}

export function App() {
  const route = useRoute()
  const { t, ready } = useT()
  const video = /^\/videos\/(.+)$/.exec(route)
  const chat = /^\/chat\/(.+)$/.exec(route)

  // Nothing renders until the saved language is known — see `useT`.
  if (!ready) return null

  return (
    <div class="shell">
      <h1>{t('app.title')}</h1>
      <p class="subtitle">{t('app.subtitle')}</p>

      <LanguageFilter />

      <Nav route={route} />

      {route === '/setup' ? (
        <SetupWizard />
      ) : route.startsWith('/settings') ? (
        <Settings section={sectionOf(route, '/settings', SETTINGS_SLUGS)} />
      ) : route.startsWith('/data') ? (
        <Data section={sectionOf(route, '/data', DATA_SLUGS)} />
      ) : route === '/review' ? (
        <Review />
      ) : route.startsWith('/chat') ? (
        <Chat chatId={chat?.[1]} />
      ) : route === '/dictionary' ? (
        <Dictionary />
      ) : route.startsWith('/videos') ? (
        <Videos videoId={video?.[1]} />
      ) : (
        <Overview />
      )}
    </div>
  )
}
