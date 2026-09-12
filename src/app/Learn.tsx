// The home screen, which is a placeholder until the path lands.
//
// `/` stopped being the stats dashboard in the same change that built the rail,
// because the rail is where those numbers went. What takes its place is the
// path of circles you unlock by watching, and that is a screen's worth of work
// on its own — so this slice leaves the route wired and honest about what is
// coming rather than leaving `/` pointing at a screen it no longer wants.

import { navigate } from './hooks'
import { useT } from '../i18n/useT'

export function Learn() {
  const { t } = useT()

  return (
    <div class="empty">
      <p>{t('learn.soonTitle')}</p>
      <p class="small">{t('learn.soonBody')}</p>
      <button class="primary" onClick={() => navigate('/review')}>
        {t('learn.review')}
      </button>
    </div>
  )
}
