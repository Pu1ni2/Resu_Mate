import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import App from './App'
import ProductLayer from './components/ProductLayer'
import ErrorBoundary from './components/ErrorBoundary'

// Single CSS entry. Import order and cascade layers live in index.css so the
// legacy stylesheets and Tailwind can be prioritised against each other in one
// place — a JS import cannot attach a CSS layer, so the chain has to be @import.
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