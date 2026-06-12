import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import App from './App'
import ProductLayer from './components/ProductLayer'
import ErrorBoundary from './components/ErrorBoundary'

// CSS - order matters: tokens → pages → components → overrides → themes → fixes → product layer
import './styles/design-system.css'
import './styles/landing.css'
import './styles/global.css'
import './styles/dashboard-polish.css'
import './styles/candidate-theme.css'
import './styles/interview-room.css'
import './styles/overrides.css'
import './styles/product-layer.css'

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