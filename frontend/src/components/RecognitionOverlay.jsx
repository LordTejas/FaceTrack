import { useState, useEffect, useCallback } from 'react'

function RecognitionOverlay({ faces, containerRef }) {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  const updateSize = useCallback(() => {
    if (containerRef?.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setContainerSize({ width: rect.width, height: rect.height })
    }
  }, [containerRef])

  useEffect(() => {
    updateSize()

    const observer = new ResizeObserver(updateSize)
    if (containerRef?.current) {
      observer.observe(containerRef.current)
    }

    return () => observer.disconnect()
  }, [containerRef, updateSize])

  if (!faces || faces.length === 0 || containerSize.width === 0) {
    return null
  }

  const getBorderColor = (face) => {
    if (face.status === 'recognized' || (face.student_id && face.confidence >= 0.7)) {
      return {
        border: 'border-green-500',
        bg: 'bg-green-500/80',
        text: 'text-white',
      }
    }
    if (face.status === 'uncertain' || (face.student_id && face.confidence < 0.7)) {
      return {
        border: 'border-amber-500',
        bg: 'bg-amber-500/80',
        text: 'text-white',
      }
    }
    return {
      border: 'border-red-500',
      bg: 'bg-red-500/80',
      text: 'text-white',
    }
  }

  const getLabel = (face) => {
    if (face.name) {
      const confidence = face.confidence != null
        ? ` ${(face.confidence * 100).toFixed(0)}%`
        : ''
      return `${face.name}${confidence}`
    }
    return 'Unknown'
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {faces.map((face, index) => {
        if (!face.bbox) return null

        const [x, y, w, h] = face.bbox
        const colors = getBorderColor(face)
        const label = getLabel(face)

        // Scale bbox coordinates to container size
        // bbox values are expected as fractions (0-1) or pixel values
        // If values are > 1, treat as pixel coordinates relative to original image
        const isNormalized = x <= 1 && y <= 1 && w <= 1 && h <= 1
        const left = isNormalized ? x * containerSize.width : (x / (face.imageWidth || 640)) * containerSize.width
        const top = isNormalized ? y * containerSize.height : (y / (face.imageHeight || 480)) * containerSize.height
        const boxWidth = isNormalized ? w * containerSize.width : (w / (face.imageWidth || 640)) * containerSize.width
        const boxHeight = isNormalized ? h * containerSize.height : (h / (face.imageHeight || 480)) * containerSize.height

        return (
          <div
            key={face.student_id || `face-${index}`}
            className={`absolute border-2 ${colors.border}`}
            style={{
              left: `${left}px`,
              top: `${top}px`,
              width: `${boxWidth}px`,
              height: `${boxHeight}px`,
            }}
          >
            {/* Label above the box */}
            <div
              className={`absolute bottom-full left-0 mb-1 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${colors.bg} ${colors.text}`}
            >
              {label}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default RecognitionOverlay
