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

const TABS = [
  { route: '/', label: 'Overview' },
  { route: '/review', label: 'Review' },
  { route: '/chat', label: 'Chat' },
  { route: '/dictionary', label: 'Dictionary' },
  { route: '/videos', label: 'Videos' },
  { route: '/data', label: 'Data' },
  { route: '/settings', label: 'Settings' },
]

function Nav({ route }: { route: string }) {
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
          {tab.label}
        </a>
      ))}
    </nav>
  )
}

export function App() {
  const route = useRoute()
  const video = /^\/videos\/(.+)$/.exec(route)
  const chat = /^\/chat\/(.+)$/.exec(route)

  return (
    <div class="shell">
      <h1>Flashcards</h1>
      <p class="subtitle">Everything bb-subsgen has collected while you were reading.</p>

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
