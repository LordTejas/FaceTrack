import { useEffect } from 'react'
import { CheckCircle } from 'lucide-react'
import useAppStore from '../store/appStore'

const TOAST_DURATION = 3000

function AttendanceToast() {
  const toasts = useAppStore((s) => s.toasts)
  const removeToast = useAppStore((s) => s.removeToast)

  useEffect(() => {
    if (toasts.length === 0) return

    const timers = toasts.map((toast) => {
      return setTimeout(() => {
        removeToast(toast.id)
      }, TOAST_DURATION)
    })

    return () => {
      timers.forEach(clearTimeout)
    }
  }, [toasts, removeToast])

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto bg-green-600/90 backdrop-blur rounded-lg p-4 flex items-center gap-3 shadow-lg shadow-black/20 min-w-[280px] animate-slide-in"
        >
          <CheckCircle size={20} className="text-white shrink-0" />
          <div>
            <p className="text-white font-medium text-sm">{toast.name}</p>
            <p className="text-green-100 text-xs">Attendance Marked</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export default AttendanceToast
