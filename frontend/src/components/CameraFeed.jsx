import { Camera, Loader2 } from 'lucide-react'
import useAppStore from '../store/appStore'

function CameraFeed({ className = '' }) {
  const lastFrame = useAppStore((s) => s.lastFrame)
  const activeDevice = useAppStore((s) => s.activeDevice)
  const isBackendConnected = useAppStore((s) => s.isBackendConnected)

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {lastFrame ? (
        <img
          src={`data:image/jpeg;base64,${lastFrame}`}
          alt="Camera feed"
          className="w-full h-full object-cover rounded-lg"
        />
      ) : activeDevice || isBackendConnected ? (
        <div className="w-full h-full bg-gray-800 rounded-lg flex flex-col items-center justify-center gap-3">
          <Loader2 size={32} className="text-blue-400 animate-spin" />
          <p className="text-gray-400 text-sm">Starting camera feed...</p>
        </div>
      ) : (
        <div className="w-full h-full bg-gray-800 rounded-lg flex flex-col items-center justify-center gap-3">
          <Camera size={48} className="text-gray-600" />
          <p className="text-gray-500 text-sm">No camera connected</p>
        </div>
      )}
    </div>
  )
}

export default CameraFeed
