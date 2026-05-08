import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { ConfirmProvider } from './components/UI/ConfirmModal'
import { ToastContainer } from './components/UI/ToastContainer'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <ConfirmProvider>
          <App />
          <ToastContainer />
        </ConfirmProvider>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
)
