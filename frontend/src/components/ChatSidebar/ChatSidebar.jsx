import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'react-hot-toast'
import { useChatStore, useAuthStore } from '../../store'
import api from '../../api'
import './ChatSidebar.css'

export default function ChatSidebar() {
  const {
    isSidebarOpen, toggleSidebar,
    messages, setMessages, addMessage,
    isLoading, setLoading,
    addStep, clearSteps,
    memorySummary, setMemorySummary,
  } = useChatStore()
  const user = useAuthStore((s) => s.user)

  const [input, setInput] = useState('')
  const [showMemory, setShowMemory] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const messagesEndRef = useRef(null)
  
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)

  useEffect(() => {
    fetchMessages()
    fetchMemory()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchMessages = async () => {
    try {
      const { data } = await api.get(`/chat/history`)
      setMessages(data)
    } catch (err) {
      console.error('Failed to load messages', err)
    }
  }

  const fetchMemory = async () => {
    try {
      const { data } = await api.get('/chat/memory')
      setMemorySummary(data.summary)
    } catch (err) {}
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const question = input.trim()
    setInput('')
    setLoading(true)
    clearSteps()

    addMessage({ role: 'user', content: question, id: Date.now(), created_at: new Date() })

    try {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${baseUrl}/api/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ question, session_id: 'default' }), // Keep dummy for backward compat if needed
      })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantMsg = ''

      const assistantId = Date.now() + 1
      addMessage({ role: 'assistant', content: '...', id: assistantId, created_at: new Date() })

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          try {
            const evt = JSON.parse(line.slice(6))

            if (evt.type === 'step') {
              addStep({ node: evt.node, log: evt.log })
            } else if (evt.type === 'done') {
              assistantMsg = evt.answer
              useChatStore.setState((s) => ({
                messages: s.messages.map(m =>
                  m.id === assistantId
                    ? { ...m, content: assistantMsg, sources: evt.sources }
                    : m
                )
              }))
            } else if (evt.type === 'error') {
              toast.error(evt.message)
            }
          } catch (_) {}
        }
      }

      await fetchMemory()
    } catch (err) {
      toast.error('Failed to send message')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleFileUpload = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const formData = new FormData()
    const rejectedFiles = []
    let pdfCount = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.name.toLowerCase().endsWith('.pdf')) {
        formData.append('files', file)
        pdfCount++
      } else {
        rejectedFiles.push(file.name)
      }
    }

    // Notify about rejected files
    if (rejectedFiles.length > 0) {
      const names = rejectedFiles.length <= 3
        ? rejectedFiles.join(', ')
        : `${rejectedFiles.slice(0, 3).join(', ')} +${rejectedFiles.length - 3} more`
      toast.error(
        `❌ Only PDF files are supported.\nRejected: ${names}`,
        { duration: 5000, style: { whiteSpace: 'pre-line' } }
      )
    }

    // Stop if no valid PDFs at all
    if (pdfCount === 0) {
      e.target.value = ''
      return
    }

    setIsUploading(true)
    const uploadToast = toast.loading(`Uploading ${pdfCount} PDF${pdfCount > 1 ? 's' : ''}...`)
    try {
      const { data } = await api.post('/chat/upload', formData)
      toast.success(data.message, { id: uploadToast })
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to upload files'
      toast.error(detail, { id: uploadToast })
    } finally {
      setIsUploading(false)
      e.target.value = ''
    }
  }

  const handleClearPdfs = async () => {
    try {
        await api.post('/chat/clear_pdfs')
        toast.success('Knowledge base cleared!')
    } catch (err) {
        toast.error('Failed to clear PDFs')
    }
  }
  
  const handleClearHistory = async () => {
    try {
        await api.post('/chat/clear_history')
        setMessages([])
        toast.success('Chat history cleared!')
    } catch (err) {
        toast.error('Failed to clear history')
    }
  }

  return (
    <>
      <button
        id="sidebar-toggle"
        className={`sidebar-toggle-btn ${isSidebarOpen ? 'open' : ''}`}
        onClick={toggleSidebar}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {isSidebarOpen ? <path d="M9 18l6-6-6-6" /> : <path d="M15 18l-6-6 6-6" />}
        </svg>
      </button>

      <div className={`chat-sidebar glass-strong ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-title-row">
            <h2 className="sidebar-title">🤖 AI Chat</h2>
            <div className="sidebar-actions">
              <button className="icon-btn" onClick={() => setShowMemory(!showMemory)} title="View memory">🧠</button>
            </div>
          </div>

          {showMemory && (
            <div className="memory-panel slide-in">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                 <p className="memory-title" style={{margin: 0}}>🧠 Long-term Memory</p>
                 <button onClick={handleClearHistory} style={{background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '12px'}}>Clear Chat</button>
              </div>
              <p className="memory-text">{memorySummary || 'No memory yet — start chatting!'}</p>
            </div>
          )}
        </div>

        <div className="messages-area">
          {messages.length === 0 && (
            <div className="no-session">
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #6c63ff, #a78bfa)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '28px', fontWeight: 700, color: '#fff',
                margin: '0 auto 16px',
                boxShadow: '0 4px 20px rgba(108,99,255,0.4)'
              }}>
                {user?.username?.[0]?.toUpperCase() || '👋'}
              </div>
              <p style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 6px' }}>
                Welcome back, {user?.username || 'there'}! 👋
              </p>
              <p style={{ fontSize: '13px', opacity: 0.6, margin: 0 }}>
                Upload a PDF and start asking questions — I'm ready to help.
              </p>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`message ${m.role === 'user' ? 'user-msg' : 'assistant-msg'} fade-in`}>
              <div className="msg-avatar">{m.role === 'user' ? (user?.username?.[0]?.toUpperCase() || 'U') : '🤖'}</div>
              <div className="msg-content">
                {m.content === '...' ? (
                  <div className="typing-indicator"><span /><span /><span /></div>
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                )}
                {m.sources?.length > 0 && (
                  <div className="msg-sources">
                    {m.sources.map((s, i) => <span key={i} className="source-tag">📄 {s}</span>)}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-area">
          {isLoading && <div className="loading-bar"><div className="loading-fill" /></div>}
          <div className="chat-input-row">
            <textarea
              id="chat-input"
              className="chat-textarea"
              placeholder="Ask anything… (Enter to send)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              rows={2}
            />
            <button id="btn-send" className="send-btn" onClick={sendMessage} disabled={!input.trim() || isLoading}>
              {isLoading
                ? <span className="spinner" />
                : <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
