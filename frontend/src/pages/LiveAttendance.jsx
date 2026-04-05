import { useState, useRef, useEffect, useCallback } from 'react'
import { Camera, Play, Square, Clock, Wifi, WifiOff, UserPlus, Search } from 'lucide-react'
import DeviceSelector from '../components/DeviceSelector'
import CameraFeed from '../components/CameraFeed'
import RecognitionOverlay from '../components/RecognitionOverlay'
import ManualConfirm from '../components/ManualConfirm'
import useAppStore from '../store/appStore'
import { createSession, updateSession, getStudents, createAttendance } from '../services/api'

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [
    h > 0 ? String(h).padStart(2, '0') : null,
    String(m).padStart(2, '0'),
    String(s).padStart(2, '0'),
  ]
    .filter(Boolean)
    .join(':')
}

function LiveAttendance() {
  const containerRef = useRef(null)

  const isBackendConnected = useAppStore((s) => s.isBackendConnected)
  const lastFaces = useAppStore((s) => s.lastFaces)
  const pendingConfirmations = useAppStore((s) => s.pendingConfirmations)
  const currentSession = useAppStore((s) => s.currentSession)
  const setCurrentSession = useAppStore((s) => s.setCurrentSession)

  const [showSessionForm, setShowSessionForm] = useState(false)
  const [sessionName, setSessionName] = useState('')
  const [startingSession, setStartingSession] = useState(false)
  const [endingSession, setEndingSession] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')

  // Manual attendance
  const [showManualMark, setShowManualMark] = useState(false)
  const [students, setStudents] = useState([])
  const [studentSearch, setStudentSearch] = useState('')
  const [markingStudent, setMarkingStudent] = useState(null)

  // Elapsed time ticker
  useEffect(() => {
    if (!currentSession) {
      setElapsed(0)
      return
    }

    const startTime = new Date(currentSession.started_at || currentSession.created_at).getTime()

    const tick = () => {
      const now = Date.now()
      setElapsed(Math.floor((now - startTime) / 1000))
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [currentSession])

  const handleStartSession = useCallback(async () => {
    if (!sessionName.trim()) return
    setStartingSession(true)
    setError('')
    try {
      const result = await createSession({ name: sessionName.trim() })
      const session = result.session || result
      setCurrentSession(session)
      setShowSessionForm(false)
      setSessionName('')
    } catch (err) {
      setError(err.message || 'Failed to start session')
    } finally {
      setStartingSession(false)
    }
  }, [sessionName, setCurrentSession])

  const handleEndSession = useCallback(async () => {
    if (!currentSession) return
    setEndingSession(true)
    setError('')
    try {
      await updateSession(currentSession.id, { status: 'ended', ended_at: new Date().toISOString() })
      setCurrentSession(null)
    } catch (err) {
      setError(err.message || 'Failed to end session')
    } finally {
      setEndingSession(false)
    }
  }, [currentSession, setCurrentSession])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Live Attendance</h1>
        <p className="text-gray-400 text-sm mt-1">
          Connect a camera and track attendance in real time
        </p>
      </div>

      {/* Device selector */}
      <DeviceSelector />

      {/* Connection Status */}
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          {isBackendConnected ? (
            <Wifi size={14} className="text-green-400" />
          ) : (
            <WifiOff size={14} className="text-gray-500" />
          )}
          <span className={isBackendConnected ? 'text-green-400' : 'text-gray-500'}>
            {isBackendConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Session Controls */}
      <div className="bg-gray-800 rounded-lg border border-gray-700/50 p-4">
        {currentSession ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-white font-medium text-sm">
                  {currentSession.name}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-400">
                <Clock size={14} />
                <span className="text-sm font-mono">{formatElapsed(elapsed)}</span>
              </div>
            </div>
            <button
              onClick={handleEndSession}
              disabled={endingSession}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Square size={14} />
              {endingSession ? 'Ending...' : 'End Session'}
            </button>
          </div>
        ) : showSessionForm ? (
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Session Name</label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="e.g. Morning Lecture - CS101"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleStartSession()
                }}
                className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
                autoFocus
              />
            </div>
            <button
              onClick={handleStartSession}
              disabled={!sessionName.trim() || startingSession}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              <Play size={14} />
              {startingSession ? 'Starting...' : 'Start'}
            </button>
            <button
              onClick={() => {
                setShowSessionForm(false)
                setSessionName('')
              }}
              className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-gray-400">
              <Camera size={20} />
              <p className="text-sm">
                Start a session to begin attendance tracking.
              </p>
            </div>
            <button
              onClick={() => setShowSessionForm(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              <Play size={14} />
              Start Session
            </button>
          </div>
        )}

        {error && (
          <p className="text-red-400 text-xs mt-2">{error}</p>
        )}
      </div>

      {/* Camera Feed with Recognition Overlay */}
      <div className="relative aspect-video w-full max-w-4xl" ref={containerRef}>
        <CameraFeed className="w-full h-full" />
        <RecognitionOverlay faces={lastFaces} containerRef={containerRef} />
      </div>

      {/* Manual Confirm Panel */}
      {pendingConfirmations.length > 0 && (
        <div className="max-w-4xl">
          <ManualConfirm />
        </div>
      )}

      {/* Manual Attendance Section */}
      {currentSession && (
        <div className="max-w-4xl">
          <button
            onClick={async () => {
              setShowManualMark(!showManualMark)
              if (!showManualMark && students.length === 0) {
                try {
                  const data = await getStudents({ limit: 100 })
                  setStudents(Array.isArray(data) ? data : data.students || data || [])
                } catch { /* ignore */ }
              }
            }}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border border-gray-700"
          >
            <UserPlus size={16} />
            Mark Attendance Manually
          </button>

          {showManualMark && (
            <div className="mt-3 bg-gray-900 border border-gray-700 rounded-lg p-4">
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search student by name or ID..."
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
                />
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {students
                  .filter((s) => {
                    const q = studentSearch.toLowerCase()
                    return !q || s.name?.toLowerCase().includes(q) || s.id?.toLowerCase().includes(q)
                  })
                  .map((student) => (
                    <div
                      key={student.id}
                      className="flex items-center justify-between bg-gray-800/50 hover:bg-gray-800 rounded-lg px-3 py-2 transition-colors"
                    >
                      <div>
                        <span className="text-white text-sm">{student.name}</span>
                        <span className="text-gray-500 text-xs ml-2">{student.id}</span>
                      </div>
                      <button
                        onClick={async () => {
                          setMarkingStudent(student.id)
                          try {
                            await createAttendance({
                              student_id: student.id,
                              session_id: currentSession.id,
                            })
                          } catch (err) {
                            const msg = err.message || ''
                            if (!msg.includes('already')) {
                              setError(msg)
                            }
                          } finally {
                            setMarkingStudent(null)
                          }
                        }}
                        disabled={markingStudent === student.id}
                        className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {markingStudent === student.id ? 'Marking...' : 'Mark Present'}
                      </button>
                    </div>
                  ))}
                {students.length === 0 && (
                  <p className="text-gray-500 text-sm text-center py-4">No students registered.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default LiveAttendance
