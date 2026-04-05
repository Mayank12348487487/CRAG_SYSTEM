import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import './Nodes.css'

const nodeConfig = {
  retrieve: {
    label: 'Retrieve',
    icon: '🔍',
    desc: 'Fetch top-K chunks from FAISS vector store',
    color: '#6c63ff',
    glow: 'rgba(108,99,255,0.4)',
  },
  grade: {
    label: 'Grade Documents',
    icon: '⚖️',
    desc: 'LLM evaluates if context is relevant',
    color: '#00d4ff',
    glow: 'rgba(0,212,255,0.4)',
  },
  rewrite: {
    label: 'Web Search',
    icon: '🌐',
    desc: 'Tavily search + rewrite query',
    color: '#ff63c7',
    glow: 'rgba(255,99,199,0.4)',
  },
  generate: {
    label: 'Generate Answer',
    icon: '✨',
    desc: 'LLM generates final answer with memory',
    color: '#00ffaa',
    glow: 'rgba(0,255,170,0.4)',
  },
  memory: {
    label: 'Memory',
    icon: '🧠',
    desc: 'Short & long-term memory context',
    color: '#ffa500',
    glow: 'rgba(255,165,0,0.4)',
  },
  input: {
    label: 'User Input',
    icon: '💬',
    desc: 'Question from the user',
    color: '#a78bfa',
    glow: 'rgba(167,139,250,0.4)',
  },
  output: {
    label: 'Output',
    icon: '📤',
    desc: 'Final answer delivered to user',
    color: '#34d399',
    glow: 'rgba(52,211,153,0.4)',
  },
  pdf: {
    label: 'PDF Document',
    icon: '📄',
    desc: 'Uploaded document',
    color: '#3498db',
    glow: 'rgba(52,152,219,0.4)',
  },
  vectorStore: {
    label: 'FAISS Index',
    icon: '🗄️',
    desc: 'Vector Store',
    color: '#9b59b6',
    glow: 'rgba(155,89,182,0.4)',
  },
  llm: {
    label: 'CRAG LLM',
    icon: '🤖',
    desc: 'Corrective RAG',
    color: '#2ecc71',
    glow: 'rgba(46,204,113,0.4)',
  },
}

function CRAGNode({ data, selected }) {
  const cfg = nodeConfig[data.type] || nodeConfig.pdf
  const isActive = data.active || false

  return (
    <div
      className={`crag-node ${selected ? 'selected' : ''} ${isActive ? 'active' : ''}`}
      style={{
        '--node-color': data.color || cfg.color,
        '--node-glow': data.glow || cfg.glow,
      }}
      title={data.fullLabel || ''}
    >
      <Handle type="target" position={Position.Left} className="node-handle" />

      <div className="node-header">
        <span className="node-icon">{data.icon || cfg.icon}</span>
        <span className="node-label">{data.label || cfg.label}</span>
        {data.type === 'pdf' && data.onDelete && (
          <button 
            className="node-delete-btn" 
            onClick={(e) => {
              e.stopPropagation()
              data.onDelete(data.fullLabel)
            }}
            title="Remove document"
          >
            ✕
          </button>
        )}
        {isActive && <span className="node-pulse" />}
      </div>

      <p className="node-desc">{data.desc || cfg.desc}</p>

      {data.log && (
        <div className="node-log">
          <span className="log-dot" />
          {data.log}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="node-handle" />
    </div>
  )
}

export default memo(CRAGNode)
export { nodeConfig }
