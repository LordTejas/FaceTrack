import { useEffect, useRef, useState, useCallback } from 'react'
import useAppStore from '../store/appStore'

const MAX_RETRIES = 10
const RECONNECT_DELAY = 2000

function getWsBaseUrl() {
  // In production (Tauri bundle), connect directly to backend
  const isProduction = !window.location.port || window.location.protocol === 'tauri:'
  if (isProduction) {
    return 'ws://127.0.0.1:8000'
  }
  // In dev mode, Vite proxy handles ws:// on the same host
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}`
}

export default function useWebSocket() {
  const videoWsRef = useRef(null)
  const eventsWsRef = useRef(null)
  const videoRetriesRef = useRef(0)
  const eventsRetriesRef = useRef(0)
  const mountedRef = useRef(true)

  const [isVideoConnected, setIsVideoConnected] = useState(false)
  const [isEventsConnected, setIsEventsConnected] = useState(false)

  const setLastFrame = useAppStore((s) => s.setLastFrame)
  const addEvent = useAppStore((s) => s.addEvent)
  const addToast = useAppStore((s) => s.addToast)
  const setBackendConnected = useAppStore((s) => s.setBackendConnected)

  // Sync backend connection status with store
  useEffect(() => {
    setBackendConnected(isVideoConnected || isEventsConnected)
  }, [isVideoConnected, isEventsConnected, setBackendConnected])
  const addPendingConfirmation = useAppStore((s) => s.addPendingConfirmation)

  const connectVideoFeed = useCallback(() => {
    if (!mountedRef.current) return

    const wsBase = getWsBaseUrl()
    const ws = new WebSocket(`${wsBase}/ws/video-feed`)

    ws.onopen = () => {
      videoRetriesRef.current = 0
      setIsVideoConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        setLastFrame(msg.data, msg.faces)
      } catch {
        // Ignore malformed messages
      }
    }

    ws.onclose = () => {
      setIsVideoConnected(false)
      if (mountedRef.current && videoRetriesRef.current < MAX_RETRIES) {
        videoRetriesRef.current += 1
        setTimeout(connectVideoFeed, RECONNECT_DELAY)
      }
    }

    ws.onerror = () => {
      ws.close()
    }

    videoWsRef.current = ws
  }, [setLastFrame])

  const connectEvents = useCallback(() => {
    if (!mountedRef.current) return

    const wsBase = getWsBaseUrl()
    const ws = new WebSocket(`${wsBase}/ws/events`)

    ws.onopen = () => {
      eventsRetriesRef.current = 0
      setIsEventsConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        switch (msg.type) {
          case 'attendance_marked':
            addEvent(msg)
            addToast({
              type: 'attendance',
              name: msg.name,
              student_id: msg.student_id,
            })
            break

          case 'face_uncertain':
            addPendingConfirmation(msg)
            break

          case 'face_recognized':
          case 'face_unknown':
            addEvent(msg)
            break

          default:
            addEvent(msg)
            break
        }
      } catch {
        // Ignore malformed messages
      }
    }

    ws.onclose = () => {
      setIsEventsConnected(false)
      if (mountedRef.current && eventsRetriesRef.current < MAX_RETRIES) {
        eventsRetriesRef.current += 1
        setTimeout(connectEvents, RECONNECT_DELAY)
      }
    }

    ws.onerror = () => {
      ws.close()
    }

    eventsWsRef.current = ws
  }, [addEvent, addToast, addPendingConfirmation])

  useEffect(() => {
    mountedRef.current = true

    connectVideoFeed()
    connectEvents()

    return () => {
      mountedRef.current = false

      if (videoWsRef.current) {
        videoWsRef.current.close()
        videoWsRef.current = null
      }
      if (eventsWsRef.current) {
        eventsWsRef.current.close()
        eventsWsRef.current = null
      }
    }
  }, [connectVideoFeed, connectEvents])

  return { isVideoConnected, isEventsConnected }
}
