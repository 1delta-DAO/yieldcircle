import React from 'react'
import ReactDOM from 'react-dom/client'
import { Deck } from './Deck'
import '@yieldcircle/design/index.css'
import './deck.css'

// /deck — the pitch deck's own entry (deck.html): no wallet stack, no gate, no routes.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Deck />
  </React.StrictMode>,
)
