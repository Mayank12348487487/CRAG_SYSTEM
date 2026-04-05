import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

function ProtectedRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'rgba(13,13,43,0.95)',
            color: '#f0f0ff',
            border: '1px solid rgba(108,99,255,0.3)',
            backdropFilter: 'blur(20px)',
            fontFamily: 'Inter, sans-serif',
          },
          success: { iconTheme: { primary: '#00ffaa', secondary: '#07071a' } },
          error: { iconTheme: { primary: '#ff8080', secondary: '#07071a' } },
        }}
      />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
