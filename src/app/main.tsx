import { render } from 'preact'
import { App } from './App'
import { Embed } from './Embed'
import './style.css'

// The same page serves two purposes: the flashcards app, and the explanation
// drawer framed inside a video. `embed` is in the search rather than the hash so
// the hash router underneath is untouched by it.
const embedded = new URLSearchParams(location.search).get('embed') === '1'

render(embedded ? <Embed /> : <App />, document.getElementById('app')!)
