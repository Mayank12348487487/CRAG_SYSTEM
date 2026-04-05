import { getSmoothStepPath } from 'reactflow'

export default function BubbleEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetPosition,
    targetX,
    targetY,
  })

  return (
    <>
      <path
        id={id}
        style={{ ...style, fill: 'none' }}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
      />
      
      {/* Multiple smaller moving bubble particles */}
      <circle r="3" fill="#3498db" style={{ filter: 'drop-shadow(0 0 4px #3498db)' }}>
        <animateMotion dur="2.5s" repeatCount="indefinite" path={edgePath} begin="0s" />
      </circle>
      <circle r="3" fill="#3498db" style={{ filter: 'drop-shadow(0 0 4px #3498db)' }}>
        <animateMotion dur="2.5s" repeatCount="indefinite" path={edgePath} begin="0.8s" />
      </circle>
      <circle r="3" fill="#3498db" style={{ filter: 'drop-shadow(0 0 4px #3498db)' }}>
        <animateMotion dur="2.5s" repeatCount="indefinite" path={edgePath} begin="1.6s" />
      </circle>
    </>
  )
}
