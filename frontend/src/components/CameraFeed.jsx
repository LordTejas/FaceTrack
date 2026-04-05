import { Camera } from 'lucide-react'
import useAppStore from '../store/appStore'

function CameraFeed({ className = '' }) {
  const lastFrame = useAppStore((s) => s.lastFrame)

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {lastFrame ? (
        <img
          src={`data:image/jpeg;base64,${lastFrame}`}
          alt="Camera feed"
          className="w-full h-full object-cover rounded-lg transition-opacity duration-300"
        />
      ) : (
        <div className="w-full h-full bg-gray-800 rounded-lg flex flex-col items-center justify-center gap-3 transition-opacity duration-300">
          <Camera size={48} className="text-gray-600" />
          <p className="text-gray-500 text-sm">No camera connected</p>
        </div>
      )}
    </div>
  )
}

export default CameraFeed
