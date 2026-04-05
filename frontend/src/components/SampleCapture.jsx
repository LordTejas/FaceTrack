import { useState, useEffect, useCallback, useRef } from 'react'
import { Camera, X, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import CameraFeed from './CameraFeed'
import { captureSample, getStudentSamples, deleteSample, getDevices, connectDevice, getActiveDevice } from '../services/api'
import useAppStore from '../store/appStore'

const GUIDANCE_TEXTS = [
  'Look straight at the camera',
  'Turn slightly left',
  'Turn slightly right',
  'Tilt up slightly',
  'Tilt down slightly',
]

const MIN_SAMPLES = 4

function SampleCapture({ studentId, onComplete }) {
  const [samples, setSamples] = useState([])
  const [capturing, setCapturing] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  // Camera state — local only, no dependency on store for device list
  const [devices, setDevices] = useState([])
  const [selectedDevice, setSelectedDevice] = useState('')
  const [cameraLoading, setCameraLoading] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [connectedName, setConnectedName] = useState('')

  const setActiveDevice = useAppStore((s) => s.setActiveDevice)
  const initDone = useRef(false)

  const guidanceIndex = samples.length % GUIDANCE_TEXTS.length
  const guidanceText = GUIDANCE_TEXTS[guidanceIndex]
  const hasEnoughSamples = samples.length >= MIN_SAMPLES

  // Load devices list only (no auto-connect)
  const loadDevices = useCallback(async () => {
    try {
      const data = await getDevices()
      return Array.isArray(data) ? data : data.devices || []
    } catch {
      return []
    }
  }, [])

  // Connect to a specific device
  const doConnect = useCallback(async (deviceId, deviceName) => {
    setCameraLoading(true)
    setCameraError('')
    try {
      await connectDevice(deviceId)
      setIsConnected(true)
      setConnectedName(deviceName || deviceId)
      setSelectedDevice(deviceId)
      setActiveDevice({ id: deviceId, name: deviceName || deviceId })
    } catch (err) {
      setCameraError('Failed to connect: ' + (err.message || ''))
      setIsConnected(false)
    } finally {
      setCameraLoading(false)
    }
  }, [setActiveDevice])

  // Init: load devices, check active, auto-connect if needed — runs ONCE
  useEffect(() => {
    if (initDone.current) return
    initDone.current = true

    ;(async () => {
      const deviceList = await loadDevices()
      setDevices(deviceList)

      // Check if already active
      try {
        const result = await getActiveDevice()
        const active = result?.device || result
        if (active && active.id) {
          // Ensure frame processor is running by calling connect (it's idempotent)
          await doConnect(active.id, active.name)
          return
        }
      } catch {
        // No active device
      }

      // Auto-connect first available
      if (deviceList.length > 0) {
        await doConnect(deviceList[0].id, deviceList[0].name)
      }
    })()
  }, [loadDevices, doConnect])

  // Manual refresh button
  const handleRefresh = async () => {
    const deviceList = await loadDevices()
    setDevices(deviceList)
  }

  // Manual camera switch
  const handleCameraChange = async (deviceId) => {
    if (!deviceId) return // "Select a camera..." chosen — do nothing
    if (deviceId === selectedDevice && isConnected) return // Already on this one
    const device = devices.find((d) => d.id === deviceId)
    await doConnect(deviceId, device?.name || deviceId)
  }

  // Fetch existing samples
  const fetchSamples = useCallback(async () => {
    try {
      const data = await getStudentSamples(studentId)
      setSamples(data.samples || data || [])
    } catch (err) {
      console.error('Failed to fetch samples:', err)
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => {
    fetchSamples()
  }, [fetchSamples])

  const handleCapture = async () => {
    setCapturing(true)
    setError('')
    try {
      const result = await captureSample(studentId)
      const newSample = result.sample || result
      setSamples((prev) => [...prev, newSample])
    } catch (err) {
      const msg = err.message || 'Failed to capture sample'
      if (msg.toLowerCase().includes('no face')) {
        setError('No face detected. Please ensure your face is clearly visible.')
      } else if (msg.toLowerCase().includes('multiple face')) {
        setError('Multiple faces detected. Please ensure only one face is in the frame.')
      } else if (msg.toLowerCase().includes('camera') || msg.toLowerCase().includes('connect')) {
        setError('Camera not connected. Please select and connect a camera above.')
      } else {
        setError(msg)
      }
    } finally {
      setCapturing(false)
    }
  }

  const handleDelete = async (sampleId) => {
    setDeleting(sampleId)
    setError('')
    try {
      await deleteSample(studentId, sampleId)
      setSamples((prev) => prev.filter((s) => (s.id || s.sample_id) !== sampleId))
    } catch (err) {
      setError(err.message || 'Failed to delete sample')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* Camera Selector */}
      <div className="flex items-center gap-3 max-w-lg">
        <select
          value={selectedDevice}
          onChange={(e) => handleCameraChange(e.target.value)}
          disabled={cameraLoading}
          className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">Select a camera...</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} {d.id === selectedDevice && isConnected ? '(connected)' : ''}
            </option>
          ))}
        </select>
        <button
          onClick={handleRefresh}
          disabled={cameraLoading}
          className="bg-gray-700 hover:bg-gray-600 text-gray-300 p-2 rounded-lg transition-colors"
          title="Refresh cameras"
        >
          <RefreshCw size={16} className={cameraLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Camera status */}
      {cameraLoading && (
        <div className="flex items-center gap-2 text-blue-400 text-sm">
          <Loader2 size={14} className="animate-spin" />
          Connecting to camera...
        </div>
      )}
      {cameraError && (
        <div className="flex items-start gap-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg p-3 text-sm max-w-lg">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{cameraError}</span>
        </div>
      )}
      {isConnected && !cameraLoading && (
        <div className="flex items-center gap-2 text-green-400 text-xs">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          Connected to {connectedName}
        </div>
      )}

      {/* Camera Preview */}
      <div className="w-full max-w-sm aspect-video">
        <CameraFeed className="w-full h-full rounded-lg" />
      </div>

      {/* Guidance */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 max-w-sm">
        <div className="flex items-center gap-2">
          <Camera size={16} className="text-blue-400 shrink-0" />
          <p className="text-blue-300 text-sm font-medium">{guidanceText}</p>
        </div>
      </div>

      {/* Capture Button */}
      <button
        onClick={handleCapture}
        disabled={capturing || !isConnected}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 px-6 rounded-lg text-sm transition-colors"
      >
        {capturing ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Camera size={16} />
        )}
        {capturing ? 'Capturing...' : 'Capture Sample'}
      </button>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg p-3 text-sm max-w-lg">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Progress */}
      <div className="flex items-center gap-2">
        <div className="flex-1 max-w-xs bg-gray-800 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${
              hasEnoughSamples ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${Math.min((samples.length / 5) * 100, 100)}%` }}
          />
        </div>
        <span className="text-sm text-gray-400">
          {samples.length} of 5 samples captured
          {!hasEnoughSamples && ` (minimum ${MIN_SAMPLES} required)`}
        </span>
      </div>

      {/* Thumbnails Grid */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Loader2 size={14} className="animate-spin" />
          Loading samples...
        </div>
      ) : samples.length > 0 ? (
        <div className="grid grid-cols-5 gap-3 max-w-lg">
          {samples.map((sample) => {
            const sampleId = sample.id || sample.sample_id
            const imgPath = sample.sample_image_path || sample.path
            return (
              <div
                key={sampleId}
                className="relative group aspect-square bg-gray-800 rounded-lg border border-gray-700 overflow-hidden"
              >
                {imgPath ? (
                  <img
                    src={`/data/${imgPath}`}
                    alt={`Sample ${sampleId}`}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Camera size={20} className="text-gray-600" />
                  </div>
                )}
                <button
                  onClick={() => handleDelete(sampleId)}
                  disabled={deleting === sampleId}
                  className="absolute top-1 right-1 bg-red-600/90 hover:bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                  title="Delete sample"
                >
                  {deleting === sampleId ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <X size={12} />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-gray-500 text-sm">No samples captured yet. Use the button above to capture face samples.</p>
      )}

      {/* Done Button */}
      <div className="pt-2">
        <button
          onClick={onComplete}
          disabled={!hasEnoughSamples}
          className={`flex items-center gap-2 font-medium py-2.5 px-6 rounded-lg text-sm transition-colors ${
            hasEnoughSamples
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          <CheckCircle size={16} />
          Done
        </button>
        {!hasEnoughSamples && (
          <p className="text-gray-500 text-xs mt-2">
            Capture at least {MIN_SAMPLES} samples to continue.
          </p>
        )}
      </div>
    </div>
  )
}

export default SampleCapture
