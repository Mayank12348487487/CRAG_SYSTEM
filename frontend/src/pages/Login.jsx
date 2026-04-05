import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../store'
import api from '../api'
import './Login.css'

export default function Login() {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register'
      const payload =
        mode === 'login'
          ? { email: form.email, password: form.password }
          : { username: form.username, email: form.email, password: form.password }

      const { data } = await api.post(endpoint, payload)
      login(data.access_token, data.user)
      toast.success(`Welcome back, ${data.user.username}! 🚀`)
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-bg">
      {/* Animated orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      {/* Grid overlay */}
      <div className="grid-overlay" />

      <div className="login-center fade-in">
        {/* Logo */}
        <div className="login-logo">
          <div className="logo-icon">
            <svg viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="18" stroke="url(#grad)" strokeWidth="2"/>
              <path d="M12 20 L18 14 L24 20 L18 26 Z" fill="url(#grad)" opacity="0.8"/>
              <path d="M20 12 L28 20 L20 28 L26 20 Z" fill="url(#grad2)" opacity="0.6"/>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#6c63ff"/>
                  <stop offset="100%" stopColor="#00d4ff"/>
                </linearGradient>
                <linearGradient id="grad2" x1="1" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00d4ff"/>
                  <stop offset="100%" stopColor="#ff63c7"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <h1 className="logo-title">CRAG System</h1>
            <p className="logo-sub">AI Workflow Intelligence</p>
          </div>
        </div>

        {/* Card */}
        <div className="login-card glass-strong">
          {/* Tabs */}
          <div className="login-tabs">
            <button
              id="tab-login"
              className={`tab-btn ${mode === 'login' ? 'active' : ''}`}
              onClick={() => setMode('login')}
            >
              Sign In
            </button>
            <button
              id="tab-register"
              className={`tab-btn ${mode === 'register' ? 'active' : ''}`}
              onClick={() => setMode('register')}
            >
              Create Account
            </button>
          </div>

          <form className="login-form" onSubmit={handleSubmit} id="auth-form">
            {mode === 'register' && (
              <div className="field-group slide-in">
                <label className="field-label">Username</label>
                <input
                  id="field-username"
                  className="input"
                  type="text"
                  placeholder="your_username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                />
              </div>
            )}

            <div className="field-group">
              <label className="field-label">Email</label>
              <input
                id="field-email"
                className="input"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>

            <div className="field-group">
              <label className="field-label">Password</label>
              <input
                id="field-password"
                className="input"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={6}
              />
            </div>

            <button
              id="btn-submit"
              type="submit"
              className="btn btn-primary login-submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                </>
              ) : (
                <>{mode === 'login' ? '🚀 Sign In' : '✨ Create Account'}</>
              )}
            </button>
          </form>

          <p className="login-switch">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              className="link-btn"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? 'Register' : 'Sign In'}
            </button>
          </p>
        </div>

        {/* Feature pills */}
        <div className="feature-pills">
          {['🧠 Memory AI', '📄 RAG Pipeline', '🔗 N8N Workflow', '⚡ Streaming'].map((f) => (
            <span key={f} className="pill">{f}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
