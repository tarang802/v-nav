import React from 'react'
import ReactDOM from 'react-dom/client'

/**
 * Two apps live in this client until Phase 7:
 *  - the rebuilt shell (src/app), which talks to the new API in server/;
 *  - the original app (src/App.jsx), which talks to server-legacy/.
 * `npm run dev:next` / `npm run build:next` select the rebuilt shell. Each is
 * loaded on demand so neither ships the other's code or styles.
 */
const load = import.meta.env.VITE_APP_SHELL === 'next' ? () => import('./app/App.jsx') : () => import('./legacyEntry.jsx')

load().then(({ default: App }) => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
