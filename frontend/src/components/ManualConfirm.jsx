import { useState, useEffect, useRef } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import useAppStore from '../store/appStore'
import { createAttendance } from '../services/api'

const COUNTDOWN_SECONDS = 10

function ConfirmationCard({ confirmation, onDismiss }) {
  const [timeLeft, setTimeLeft] = useState(COUNTDOWN_SECONDS)
  const [confirming, setConfirming] = useState(false)
  const timerRef = useRef(null)
  const currentSession = useAppStore((s) => s.currentSession)

  // Reset timer whenever the confirmation is updated (same student re-detected)
  useEffect(() => {
    setTimeLeft(COUNTDOWN_SECONDS)
    if (timerRef.current) clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          onDismiss()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [confirmation.updatedAt, onDismiss])

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      await createAttendance({
        student_id: confirmation.student_id,
        session_id: currentSession?.id,
        confidence: confirmation.confidence,
        mode: 'manual',
      })
      onDismiss()
    } catch (err) {
      console.error('Failed to confirm attendance:', err)
      setConfirming(false)
    }
  }

  // Backend sends confidence as 0-100 already
  const raw = confirmation.confidence ?? 0
  const confidencePercent = raw > 1 ? raw.toFixed(0) : (raw * 100).toFixed(0)

  return (
    <div className="bg-amber-900/50 border border-amber-600 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-sm">
            {confirmation.name || confirmation.student_id}
          </p>
          <p className="text-amber-300 text-xs mt-0.5">
            Confidence: {confidencePercent}% -- Manual confirmation needed
          </p>
          <p className="text-amber-600 text-xs mt-1">
            Auto-dismissing in {timeLeft}s
          </p>

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-1.5 px-4 rounded-lg text-xs transition-colors"
            >
              <Check size={14} />
              {confirming ? 'Confirming...' : 'Confirm'}
            </button>
            <button
              onClick={onDismiss}
              className="flex items-center gap-1.5 bg-gray-600 hover:bg-gray-500 text-gray-200 font-medium py-1.5 px-4 rounded-lg text-xs transition-colors"
            >
              <X size={14} />
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ManualConfirm() {
  const pendingConfirmations = useAppStore((s) => s.pendingConfirmations)
  const removePendingConfirmation = useAppStore((s) => s.removePendingConfirmation)

  if (pendingConfirmations.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-amber-400">
        Pending Confirmations ({pendingConfirmations.length})
      </h3>
      {pendingConfirmations.map((confirmation) => (
        <ConfirmationCard
          key={confirmation.student_id}
          confirmation={confirmation}
          onDismiss={() => removePendingConfirmation(confirmation.student_id)}
        />
      ))}
    </div>
  )
}

export default ManualConfirm
