import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import App from './App'
import ProductLayer from './components/ProductLayer'
import ErrorBoundary from './components/ErrorBoundary'

// Fonts ship with the app rather than coming from a font site. Each file only
// declares @font-face, so it needs no cascade layer, and a browser downloads a
// weight the first time a page uses it. The family names are the ones
// --font-sans and --font-mono ask for; Instrument Serif is the new homepage's.
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import '@fontsource/jetbrains-mono/700.css'

// Single CSS entry for everything else. Import order and cascade layers live in
// index.css so the legacy stylesheets and Tailwind can be prioritised against
// each other in one place — a JS import cannot attach a CSS layer, so the chain
// has to be @import.
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AppProvider>
          <ProductLayer>
            <App />
          </ProductLayer>
        </AppProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)