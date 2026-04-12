import { useState, useEffect, useCallback } from 'react'
import { Camera, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import CameraFeed from './CameraFeed'
import { captureSample, getStudentSamples, deleteSample } from '../services/api'

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

  const guidanceIndex = samples.length % GUIDANCE_TEXTS.length
  const guidanceText = GUIDANCE_TEXTS[guidanceIndex]
  const hasEnoughSamples = samples.length >= MIN_SAMPLES

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
        setError('Camera not connected. Go to Live Attendance page and connect a camera first.')
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
      {/* Camera Preview — just displays the WebSocket feed, no connection logic */}
      <div className="w-full max-w-md aspect-video">
        <CameraFeed className="w-full h-full rounded-lg" />
      </div>

      {/* Guidance */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 max-w-md">
        <div className="flex items-center gap-2">
          <Camera size={16} className="text-blue-400 shrink-0" />
          <p className="text-blue-300 text-sm font-medium">{guidanceText}</p>
        </div>
      </div>

      {/* Capture Button */}
      <button
        onClick={handleCapture}
        disabled={capturing}
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
