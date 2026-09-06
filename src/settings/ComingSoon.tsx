// The badge that says a control is not finished yet.
//
// In `src/settings/` rather than in the app because both hosts render it — the
// settings rows in the popup and the app, and the wizard's language cards —
// which is the same reason `.tag` moved from the app's stylesheet into
// `skin.css` underneath it.
//
// `title` is required, not optional: a badge that says only "Coming soon" tells
// you that something is missing and not what, which is the half of the message
// worth having.

import { useT } from '../i18n/useT'

export function ComingSoon({ title }: { title: string }) {
  const { t } = useT()

  return (
    <span class="tag soon" title={title}>
      {t('comingSoon')}
    </span>
  )
}
