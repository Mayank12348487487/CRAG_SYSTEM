import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../../store'
import './Navbar.css'

export default function Navbar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    toast.success('Logged out successfully')
    navigate('/login')
  }

  return (
    <nav className="navbar glass-strong" id="main-navbar">
      {/* Logo */}
      <div className="nav-logo">
        <div className="nav-logo-icon">
          <svg viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="14" stroke="url(#navGrad)" strokeWidth="1.5"/>
            <path d="M9 16 L14 11 L19 16 L14 21 Z" fill="url(#navGrad)" opacity="0.8"/>
            <path d="M16 9 L23 16 L16 23 L21 16 Z" fill="url(#navGrad2)" opacity="0.6"/>
            <defs>
              <linearGradient id="navGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6c63ff"/>
                <stop offset="100%" stopColor="#00d4ff"/>
              </linearGradient>
              <linearGradient id="navGrad2" x1="1" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00d4ff"/>
                <stop offset="100%" stopColor="#ff63c7"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div>
          <span className="nav-logo-text">CRAG System</span>
          <span className="nav-logo-badge">AI</span>
        </div>
      </div>

      {/* Center title */}
      <div className="nav-center">
        <span className="nav-page-title">Workflow Canvas</span>
        <span className="nav-status">
          <span className="status-dot" />
          Live
        </span>
      </div>

      {/* Right: user */}
      <div className="nav-right">
        <div className="nav-user">
          <div className="nav-avatar">
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="nav-user-info">
            <span className="nav-username">{user?.username}</span>
            <span className="nav-email">{user?.email}</span>
          </div>
        </div>
        <button id="btn-logout" className="btn btn-ghost logout-btn" onClick={handleLogout}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
          Logout
        </button>
      </div>
    </nav>
  )
}
