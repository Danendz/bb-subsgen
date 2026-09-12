// The route table, and nothing else. The frame around every screen is Shell.tsx
// and the numbers beside them are Aside.tsx.

import { Data, DATA_SLUGS } from './Data'
import { Dictionary } from './Dictionary'
import { Learn } from './Learn'
import { Review } from './Review'
import { Settings, SETTINGS_SLUGS } from './Settings'
import { SetupWizard } from './SetupWizard'
import { Shell } from './Shell'
import { Videos } from './Videos'
import { Chat } from './chat/Chat'
import { useRoute } from './hooks'
import { sectionOf } from './section-route'
import { useT } from '../i18n/useT'

export function App() {
  const route = useRoute()
  const { ready } = useT()
  const video = /^\/videos\/(.+)$/.exec(route)
  const chat = /^\/chat\/(.+)$/.exec(route)

  // Nothing renders until the saved language is known — see `useT`.
  if (!ready) return null

  return (
    <Shell route={route} aside={route !== '/setup'}>
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
        <Learn />
      )}
    </Shell>
  )
}
