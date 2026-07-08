import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '../App.tsx'
import '../../styles/globals.css'

// Error boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Application error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          textAlign: 'center', 
          padding: '50px', 
          fontFamily: 'Arial, sans-serif',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <h1 style={{ color: '#030213', marginBottom: '20px' }}>
            Bitwix Technologies Private Limited
          </h1>
          <p style={{ marginBottom: '20px', color: '#666' }}>
            Something went wrong. Please try refreshing the page.
          </p>
          <div style={{ marginBottom: '30px' }}>
            <button 
              onClick={() => window.location.reload()}
              style={{
                background: '#030213',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '5px',
                cursor: 'pointer',
                marginRight: '10px'
              }}
            >
              Refresh Page
            </button>
          </div>
          <div style={{ borderTop: '1px solid #eee', paddingTop: '20px' }}>
            <p style={{ marginBottom: '10px', fontWeight: 'bold' }}>Contact us directly:</p>
            <p style={{ margin: '5px 0' }}>
              📞 <a href="tel:+918261861224" style={{ color: '#030213' }}>+91-8261861224</a>
            </p>
            <p style={{ margin: '5px 0' }}>
              📧 <a href="mailto:support@bitwix.co.in" style={{ color: '#030213' }}>support@bitwix.co.in</a>
            </p>
            <p style={{ margin: '5px 0' }}>
              🌐 <a href="https://www.bitwix.co.in" style={{ color: '#030213' }}>www.bitwix.co.in</a>
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Check if we're in development mode
const isDevelopment = import.meta.env.DEV

// Performance monitoring
if (isDevelopment) {
  console.log('🚀 Bitwix Technologies website loading...')
  
  // Log render time in development
  const startTime = performance.now()
  window.addEventListener('load', () => {
    const endTime = performance.now()
    console.log(`⚡ Page rendered in ${(endTime - startTime).toFixed(2)}ms`)
  })
}

// Mount the React application
const root = ReactDOM.createRoot(document.getElementById('root')!)

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)

// Service worker registration (for PWA features if needed)
if ('serviceWorker' in navigator && !isDevelopment) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration)
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError)
      })
  })
}

// Add global error handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason)
  // You could send this to an error tracking service
})

// Add visibility change handler for analytics
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    console.log('Page became visible')
  } else {
    console.log('Page became hidden')
  }
})