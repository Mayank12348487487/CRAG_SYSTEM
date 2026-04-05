import { useEffect, useState } from 'react'
import Navbar from '../components/Layout/Navbar'
import WorkflowCanvas from '../components/Canvas/WorkflowCanvas'
import ChatSidebar from '../components/ChatSidebar/ChatSidebar'
import api from '../api'
import './Dashboard.css'

export default function Dashboard() {
  const [initMode, setInitMode] = useState('checking') // 'checking', 'loading', 'done'

  useEffect(() => {
    const checkUserHistory = async () => {
      try {
        const docsRes = await api.get('/chat/documents')
        const msgsRes = await api.get('/chat/history')
        const hasDocs = docsRes.data.documents?.length > 0
        const hasMsgs = msgsRes.data.length > 0
        
        if (hasDocs || hasMsgs) {
          setInitMode('loading')
          setTimeout(() => {
            setInitMode('done')
          }, 2500)
        } else {
          setInitMode('done')
        }
      } catch (err) {
        setInitMode('done')
      }
    }
    checkUserHistory()
  }, [])

  return (
    <div className="dashboard">
      {initMode === 'loading' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000, 
          background: 'rgba(7,7,26,0.95)', backdropFilter: 'blur(20px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '24px', fontWeight: 600
        }}>
          <div className="spinner" style={{width: '50px', height: '50px', marginBottom: '20px', borderTopColor: '#6c63ff'}} />
          Getting your stuff ready...
        </div>
      )}
      
      <Navbar />
      <div className="dashboard-body" style={{ opacity: initMode === 'checking' ? 0 : 1, transition: 'opacity 0.3s' }}>
        <WorkflowCanvas />
        <ChatSidebar />
      </div>
    </div>
  )
}
