import { useState, useEffect, useCallback } from 'react'
import {
  Brain,
  Play,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Users,
  Image,
} from 'lucide-react'
import { startTraining, getTrainingStatus, getStudents } from '../services/api'

function Training() {
  const [status, setStatus] = useState({
    status: 'idle',
    last_trained: null,
    progress: 0,
    total_students: 0,
    processed_students: 0,
  })
  const [training, setTraining] = useState(false)
  const [error, setError] = useState(null)
  const [students, setStudents] = useState([])
  const [studentsLoading, setStudentsLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getTrainingStatus()
      setStatus(data)
    } catch (err) {
      console.error('Failed to fetch training status:', err)
    }
  }, [])

  const fetchStudents = useCallback(async () => {
    setStudentsLoading(true)
    try {
      const data = await getStudents({ limit: 9999 })
      setStudents(data)
    } catch (err) {
      console.error('Failed to fetch students:', err)
    } finally {
      setStudentsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    fetchStudents()
  }, [fetchStatus, fetchStudents])

  // Poll while training
  useEffect(() => {
    if (status.status !== 'training') return
    const interval = setInterval(fetchStatus, 2000)
    return () => clearInterval(interval)
  }, [status.status, fetchStatus])

  // When training completes, refresh student list for updated sample info
  useEffect(() => {
    if (status.status === 'completed') {
      fetchStudents()
    }
  }, [status.status, fetchStudents])

  const handleRetrain = async () => {
    setTraining(true)
    setError(null)
    try {
      await startTraining()
      setStatus((prev) => ({
        ...prev,
        status: 'training',
        progress: 0,
        processed_students: 0,
      }))
    } catch (err) {
      setError(err.message || 'Failed to start training.')
    } finally {
      setTraining(false)
    }
  }

  const isTraining = status.status === 'training'

  const statusColor = {
    idle: 'text-gray-300',
    training: 'text-yellow-400',
    completed: 'text-green-400',
    failed: 'text-red-400',
  }

  const statusIcon = {
    idle: null,
    training: <Loader2 size={14} className="animate-spin text-yellow-400" />,
    completed: <CheckCircle2 size={14} className="text-green-400" />,
    failed: <AlertTriangle size={14} className="text-red-400" />,
  }

  const processedCount = status.processed_students || 0
  const totalCount = status.total_students || students.length || 0

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Training</h1>
        <p className="text-gray-400 text-sm mt-1">
          Train the face recognition model with registered student samples
        </p>
      </div>

      {/* Status card */}
      <div className="bg-gray-800 rounded-lg border border-gray-700/50 p-6 max-w-lg">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-purple-500/10 rounded-lg">
            <Brain size={24} className="text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Model Status</h2>
            <p className="text-sm text-gray-400">
              Face recognition training status
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Status</span>
            <span
              className={`font-medium capitalize flex items-center gap-1.5 ${
                statusColor[status.status] || 'text-gray-300'
              }`}
            >
              {statusIcon[status.status]}
              {isTraining ? 'Training...' : status.status}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Last Trained</span>
            <span className="text-gray-300">
              {status.last_trained
                ? new Date(status.last_trained).toLocaleString()
                : 'Never'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Registered Students</span>
            <span className="text-gray-300">{students.length}</span>
          </div>
        </div>

        {/* Progress bar */}
        {isTraining && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>
                Progress{' '}
                {totalCount > 0
                  ? `(${processedCount}/${totalCount} students)`
                  : ''}
              </span>
              <span>{Math.round(status.progress || 0)}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${status.progress || 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg p-3 text-sm flex items-center gap-2">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        {/* Retrain button */}
        <button
          onClick={handleRetrain}
          disabled={isTraining || training}
          className="mt-5 flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          {isTraining || training ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Play size={16} />
          )}
          {isTraining ? 'Training in progress...' : 'Retrain All'}
        </button>
      </div>

      {/* Student list with sample counts */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Users size={20} />
          Student Samples
        </h2>

        {studentsLoading ? (
          <div className="bg-gray-800 rounded-lg border border-gray-700/50 p-8 text-center">
            <Loader2
              size={20}
              className="animate-spin text-gray-400 mx-auto"
            />
            <p className="text-gray-500 text-sm mt-2">Loading students...</p>
          </div>
        ) : students.length === 0 ? (
          <div className="bg-gray-800 rounded-lg border border-gray-700/50 p-8">
            <p className="text-gray-500 text-sm text-center">
              No students registered yet. Register students and capture face
              samples before training.
            </p>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg border border-gray-700/50 divide-y divide-gray-700/50">
            {students.map((student) => {
              const sampleCount = student.sample_count ?? 0
              const lowSamples = sampleCount < 4

              return (
                <div
                  key={student.id}
                  className="flex items-center justify-between px-5 py-3.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-medium text-gray-300">
                      {student.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {student.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        ID: {student.id}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {lowSamples && (
                      <span
                        className="flex items-center gap-1 text-xs text-yellow-400"
                        title="Less than 4 samples -- recognition accuracy may be reduced"
                      >
                        <AlertTriangle size={12} />
                        Low
                      </span>
                    )}
                    <span
                      className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
                        lowSamples
                          ? 'bg-yellow-500/10 text-yellow-400'
                          : 'bg-green-500/10 text-green-400'
                      }`}
                    >
                      <Image size={12} />
                      {sampleCount} sample{sampleCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default Training
