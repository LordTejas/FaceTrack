import { useEffect, useRef, useCallback } from 'react'
import {
  createSession,
  updateSession,
  createAttendance,
} from '../services/api'
import useAppStore from '../store/appStore'

const AUTO_DISMISS_MS = 10_000

/**
 * Custom hook for session / attendance management.
 *
 * Provides the current session, pending confirmations,
 * and methods to start/end sessions, confirm or dismiss attendance.
 * Pending confirmations auto-dismiss after 10 seconds.
 */
export default function useAttendance() {
  const currentSession = useAppStore((s) => s.currentSession)
  const setCurrentSession = useAppStore((s) => s.setCurrentSession)
  const pendingConfirmations = useAppStore((s) => s.pendingConfirmations)
  const removePendingConfirmation = useAppStore(
    (s) => s.removePendingConfirmation
  )

  // Track auto-dismiss timers so we can clean up
  const timersRef = useRef(new Map())

  // Auto-dismiss pending confirmations after 10 seconds
  useEffect(() => {
    const timers = timersRef.current

    pendingConfirmations.forEach((conf) => {
      const key = conf.student_id
      if (!timers.has(key)) {
        const timer = setTimeout(() => {
          removePendingConfirmation(key)
          timers.delete(key)
        }, AUTO_DISMISS_MS)
        timers.set(key, timer)
      }
    })

    // Clean up timers for confirmations that were removed externally
    for (const [key, timer] of timers.entries()) {
      const stillPresent = pendingConfirmations.some(
        (c) => c.student_id === key
      )
      if (!stillPresent) {
        clearTimeout(timer)
        timers.delete(key)
      }
    }

    return () => {
      // On unmount, clear all active timers
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
      timers.clear()
    }
  }, [pendingConfirmations, removePendingConfirmation])

  /**
   * Start a new attendance session.
   * @param {string} name - Session name/label
   * @param {string} cameraId - Camera device ID to use
   * @returns {Promise<Object>} The created session
   */
  const startSession = useCallback(
    async (name, cameraId) => {
      const session = await createSession({
        name,
        camera_id: cameraId,
      })
      setCurrentSession(session)
      return session
    },
    [setCurrentSession]
  )

  /**
   * End the current attendance session.
   * @returns {Promise<Object>} The updated (completed) session
   */
  const endSession = useCallback(async () => {
    if (!currentSession) {
      throw new Error('No active session to end')
    }
    const updated = await updateSession(currentSession.id)
    setCurrentSession(null)
    return updated
  }, [currentSession, setCurrentSession])

  /**
   * Confirm a pending uncertain attendance match.
   * Creates an attendance record for the student in the current session.
   * @param {string} studentId
   * @param {string} [sessionId] - Defaults to current session ID
   */
  const confirmAttendance = useCallback(
    async (studentId, sessionId) => {
      const sid = sessionId || currentSession?.id
      if (!sid) {
        throw new Error('No active session for attendance confirmation')
      }
      await createAttendance({
        student_id: studentId,
        session_id: sid,
      })
      // Remove from pending list
      removePendingConfirmation(studentId)
    },
    [currentSession, removePendingConfirmation]
  )

  /**
   * Dismiss a pending confirmation without marking attendance.
   * @param {string} studentId
   */
  const dismissConfirmation = useCallback(
    (studentId) => {
      removePendingConfirmation(studentId)
    },
    [removePendingConfirmation]
  )

  return {
    session: currentSession,
    pendingConfirmations,
    isSessionActive: currentSession != null && currentSession.status === 'active',
    startSession,
    endSession,
    confirmAttendance,
    dismissConfirmation,
  }
}
