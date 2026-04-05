import { useCallback, useEffect, useState, useRef } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import CRAGNode, { nodeConfig } from './CRAGNode'
import BubbleEdge from './BubbleEdge'
import { useChatStore } from '../../store'
import api from '../../api'
import { toast } from 'react-hot-toast'
import './WorkflowCanvas.css'

const nodeTypes = { cragNode: CRAGNode }
const edgeTypes = { bubble: BubbleEdge }

const defaultEdgeStyle = {
  stroke: 'rgba(108,99,255,0.4)',
  strokeWidth: 2,
}

const defaultEdgeProps = {
  type: 'bubble',
  style: defaultEdgeStyle,
}

const makeNodes = (documents = []) => {
  const nodes = []
  const startX = 100
  const startY = 100

  const vectorY = documents.length > 0 ? startY + ((documents.length - 1) * 150) / 2 : startY

  const colors = ['#3498db', '#e74c3c', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c', '#e056fd']
  const icons = ['📄', '📝', '📜', '📰', '📑', '📊']

  documents.forEach((doc, idx) => {
    const shortName = doc.length > 18 ? doc.slice(0, 15) + '...' : doc
    const color = colors[idx % colors.length]
    const icon = icons[idx % icons.length]
    
    nodes.push({
      id: `pdf-${idx}`,
      type: 'cragNode',
      position: { x: startX, y: startY + idx * 150 },
      data: { 
        type: 'pdf', 
        label: shortName, 
        color: color, 
        icon: icon, 
        fullLabel: doc 
      },
    })
  })

  nodes.push({
    id: 'vector',
    type: 'cragNode',
    position: { x: 450, y: vectorY },
    data: { 
        type: 'vectorStore', 
        label: 'FAISS Index', 
        desc: `${documents.length} docs indexed` 
    },
  })

  nodes.push({
    id: 'llm',
    type: 'cragNode',
    position: { x: 800, y: vectorY },
    data: { 
        type: 'llm', 
        label: 'CRAG LLM', 
        desc: 'Corrective RAG\nmistral:7b · Tavily' 
    },
  })

  return nodes
}

const makeEdges = (documents = []) => {
  const edges = []
  documents.forEach((doc, idx) => {
    edges.push({
      id: `e-pdf-${idx}-vector`,
      source: `pdf-${idx}`,
      target: 'vector',
      ...defaultEdgeProps,
    })
  })

  edges.push({
    id: 'e-vector-llm',
    source: 'vector',
    target: 'llm',
    ...defaultEdgeProps,
  })

  return edges
}

export default function WorkflowCanvas() {
  const { documents, setDocuments } = useChatStore()
  const [confirmDelete, setConfirmDelete] = useState(null) // holds filename to delete

  const fetchDocs = useCallback(async () => {
    try {
      const { data } = await api.get('/chat/documents')
      setDocuments(data.documents || [])
    } catch (e) {
      console.error(e)
    }
  }, [setDocuments])

  const handleDeleteDocument = useCallback(async (filename) => {
    // Instead of window.confirm, we use our state
    setConfirmDelete(filename)
  }, [])

  const executeDelete = async () => {
    if (!confirmDelete) return
    const filename = confirmDelete
    setConfirmDelete(null)
    
    const deleteToast = toast.loading(`Removing ${filename}...`)
    try {
        await api.delete(`/chat/documents/${encodeURIComponent(filename)}`)
        toast.success(`${filename} removed`, { id: deleteToast })
        await fetchDocs() // Refresh the list
    } catch (err) {
        console.error(err)
        toast.error(`Failed to remove ${filename}`, { id: deleteToast })
    }
  }

  // Update makeNodes to use the handler
  const createNodes = (docs) => {
    const baseNodes = makeNodes(docs)
    return baseNodes.map(node => {
        if (node.data.type === 'pdf') {
            return {
                ...node,
                data: {
                    ...node.data,
                    onDelete: handleDeleteDocument
                }
            }
        }
        return node
    })
  }

  const [nodes, setNodes, onNodesChange] = useNodesState(createNodes(documents))
  const [edges, setEdges, onEdgesChange] = useEdgesState(makeEdges(documents))
  const [isUploading, setIsUploading] = useState(false)
  
  const fileInputRef = useRef(null)

  useEffect(() => {
    fetchDocs()
    // We can poll or just rely on mount
  }, [fetchDocs])

  useEffect(() => {
    setNodes(createNodes(documents))
    setEdges(makeEdges(documents))
  }, [documents, handleDeleteDocument])

  const handleFileUpload = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const formData = new FormData()
    let pdfCount = 0
    for (let i = 0; i < files.length; i++) {
        if (files[i].name.endsWith('.pdf')) {
            formData.append('files', files[i])
            pdfCount++
        }
    }

    if (pdfCount === 0) {
        toast.error('No PDF files selected.')
        return
    }

    setIsUploading(true)
    const uploadToast = toast.loading(`Uploading ${pdfCount} PDFs...`)
    try {
        const { data } = await api.post('/chat/upload', formData)
        toast.success(data.message, { id: uploadToast })
        await fetchDocs() // Refresh document nodes visually
    } catch (err) {
        toast.error('Failed to upload files', { id: uploadToast })
    } finally {
        setIsUploading(false)
        e.target.value = '' // Reset input
    }
  }

  return (
    <div className="canvas-wrapper">
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10001, 
          background: 'rgba(7,7,26,0.8)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'all'
        }}>
          <div style={{
            background: 'rgba(20,20,35,0.95)',
            border: '1px solid rgba(231, 76, 60, 0.3)',
            borderRadius: '20px',
            padding: '30px',
            maxWidth: '400px',
            width: '90%',
            textAlign: 'center',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            animation: 'scaleUp 0.3s ease-out'
          }}>
            <div style={{ fontSize: '40px', marginBottom: '15px' }}>⚠️</div>
            <h3 style={{ color: '#fff', marginBottom: '10px', fontSize: '20px' }}>Remove Document</h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '25px', fontSize: '14px', lineHeight: '1.6' }}>
              Are you sure you want to delete <strong style={{color: '#e74c3c'}}>{confirmDelete}</strong>?<br/>
              This will remove all associated chunks from the knowledge base.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button 
                className="btn" 
                style={{ 
                    background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)',
                    padding: '10px 20px', borderRadius: '12px'
                }}
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                style={{ 
                    background: '#e74c3c', color: '#fff', border: 'none',
                    padding: '10px 25px', borderRadius: '12px', fontWeight: 600,
                    boxShadow: '0 4px 15px rgba(231, 76, 60, 0.3)'
                }}
                onClick={executeDelete}
              >
                Yes, Delete it
              </button>
            </div>
          </div>
        </div>
      )}

      {isUploading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000, 
          background: 'rgba(7,7,26,0.95)', backdropFilter: 'blur(20px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '24px', fontWeight: 600, 
          pointerEvents: 'all' // explicitly block events
        }}>
          <div className="spinner" style={{width: '50px', height: '50px', marginBottom: '20px', borderTopColor: '#3498db'}} />
          Getting ready ur pdf's...
        </div>
      )}
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 0.75 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="rgba(108,99,255,0.15)" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => nodeConfig[n.data?.type]?.color || '#3498db'}
          maskColor="rgba(7,7,26,0.8)"
        />
      </ReactFlow>

      {/* Floating Add PDF Button */}
      <div className="canvas-fab fade-in" style={{
          position: 'absolute',
          bottom: '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          background: 'rgba(20,20,35,0.8)',
          padding: '8px 20px',
          borderRadius: '30px',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)',
          pointerEvents: 'auto',
          zIndex: 10
      }}>
          <input type="file" multiple accept=".pdf" ref={fileInputRef} hidden onChange={handleFileUpload} />
          
          <button 
             className="btn btn-primary"
             style={{ borderRadius: '50%', width: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
             onClick={() => fileInputRef.current?.click()}
             disabled={isUploading}
          >
             {isUploading ? <span className="spinner" style={{width: '20px', height: '20px'}} /> : '＋'}
          </button>
          <span style={{color: '#fff', fontWeight: 600}}>Add PDF</span>
      </div>
    </div>
  )
}
