import { useState, useEffect } from 'react'
import {
  Save,
  Loader2,
  RotateCcw,
  Wifi,
  WifiOff,
  Eye,
  Clock,
  Camera,
  Monitor,
} from 'lucide-react'
import { getConfig, updateConfig } from '../services/api'
import api from '../services/api'

const DEFAULTS = {
  recognition: {
    confidence_threshold: 0.75,
    uncertain_threshold: 0.5,
    model: 'face_recognition',
    tolerance: 0.6,
    min_face_width_px: 60,
  },
  attendance: {
    cooldown_seconds: 30,
    auto_capture_enabled: true,
    save_snapshots: true,
  },
  camera: {
    frame_skip: 2,
    jpeg_quality: 85,
    max_resolution: [1280, 720],
  },
  esp32_tft: {
    enabled: false,
    url: '',
  },
}

function Toggle({ enabled, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        enabled ? 'bg-blue-600' : 'bg-gray-600'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function Settings() {
  const [config, setConfig] = useState({
    recognition: { ...DEFAULTS.recognition },
    attendance: { ...DEFAULTS.attendance },
    camera: { ...DEFAULTS.camera },
    esp32_tft: { ...DEFAULTS.esp32_tft },
  })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [esp32Testing, setEsp32Testing] = useState(false)
  const [esp32Status, setEsp32Status] = useState(null)

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await getConfig()
        if (data) {
          setConfig((prev) => ({
            recognition: { ...prev.recognition, ...data.recognition },
            attendance: { ...prev.attendance, ...data.attendance },
            camera: { ...prev.camera, ...data.camera },
            esp32_tft: { ...prev.esp32_tft, ...data.esp32_tft },
          }))
        }
      } catch (err) {
        console.error('Failed to load config:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchConfig()
  }, [])

  const updateNested = (section, key, value) => {
    setConfig((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await updateConfig(config)
      setMessage({ type: 'success', text: 'Settings saved successfully.' })
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.message || 'Failed to save settings.',
      })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(null), 5000)
    }
  }

  const handleReset = () => {
    setConfig({
      recognition: { ...DEFAULTS.recognition },
      attendance: { ...DEFAULTS.attendance },
      camera: { ...DEFAULTS.camera },
      esp32_tft: { ...DEFAULTS.esp32_tft },
    })
    setMessage({ type: 'success', text: 'Reset to defaults. Click Save to apply.' })
    setTimeout(() => setMessage(null), 5000)
  }

  const handleTestEsp32 = async () => {
    const url = config.esp32_tft.url
    if (!url) {
      setEsp32Status({ ok: false, text: 'No URL configured.' })
      return
    }
    setEsp32Testing(true)
    setEsp32Status(null)
    try {
      // Attempt a simple fetch to the ESP32 URL through our backend
      // (to avoid CORS issues). If there's no dedicated endpoint, we just
      // ping the URL directly.
      const resp = await fetch(url, {
        method: 'GET',
        mode: 'no-cors',
        signal: AbortSignal.timeout(5000),
      })
      // no-cors returns opaque response, so if we get here it's reachable
      setEsp32Status({ ok: true, text: 'Connection successful.' })
    } catch {
      setEsp32Status({ ok: false, text: 'Connection failed. Check the URL.' })
    } finally {
      setEsp32Testing(false)
    }
  }

  // Derive display values for the resolution dropdown
  const resolutionValue = Array.isArray(config.camera.max_resolution)
    ? `${config.camera.max_resolution[0]}x${config.camera.max_resolution[1]}`
    : '1280x720'

  const handleResolutionChange = (val) => {
    const [w, h] = val.split('x').map(Number)
    updateNested('camera', 'max_resolution', [w, h])
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 text-sm mt-1">
          Configure recognition, attendance, camera, and device settings
        </p>
      </div>

      {/* Recognition */}
      <section className="bg-gray-800 rounded-lg border border-gray-700/50 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Eye size={18} className="text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Recognition</h2>
        </div>

        {/* Confidence threshold */}
        <div>
          <label className="block text-sm text-gray-300 mb-1.5">
            Confidence Threshold (
            {Math.round(config.recognition.confidence_threshold * 100)}%)
          </label>
          <input
            type="range"
            min="0.50"
            max="0.95"
            step="0.01"
            value={config.recognition.confidence_threshold}
            onChange={(e) =>
              updateNested(
                'recognition',
                'confidence_threshold',
                parseFloat(e.target.value)
              )
            }
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>50%</span>
            <span>95%</span>
          </div>
        </div>

        {/* Uncertain threshold */}
        <div>
          <label className="block text-sm text-gray-300 mb-1.5">
            Uncertain Threshold (
            {Math.round(config.recognition.uncertain_threshold * 100)}%)
          </label>
          <input
            type="range"
            min="0.30"
            max="0.90"
            step="0.01"
            value={config.recognition.uncertain_threshold}
            onChange={(e) =>
              updateNested(
                'recognition',
                'uncertain_threshold',
                parseFloat(e.target.value)
              )
            }
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>30%</span>
            <span>90%</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Matches below this are flagged as uncertain and require
            confirmation.
          </p>
        </div>

        {/* Model (read-only) */}
        <div>
          <label className="block text-sm text-gray-300 mb-1.5">Model</label>
          <input
            type="text"
            value={config.recognition.model}
            readOnly
            className="w-full bg-gray-900 border border-gray-700 text-gray-400 rounded-lg px-3 py-2.5 text-sm cursor-not-allowed"
          />
          <p className="text-xs text-gray-500 mt-1">
            Recognition model cannot be changed at runtime.
          </p>
        </div>

        {/* Min face width */}
        <div>
          <label className="block text-sm text-gray-300 mb-1.5">
            Min Face Width (px)
          </label>
          <input
            type="number"
            value={config.recognition.min_face_width_px}
            onChange={(e) =>
              updateNested(
                'recognition',
                'min_face_width_px',
                parseInt(e.target.value, 10) || 0
              )
            }
            min="20"
            max="300"
            className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Faces smaller than this pixel width will be ignored.
          </p>
        </div>
      </section>

      {/* Attendance */}
      <section className="bg-gray-800 rounded-lg border border-gray-700/50 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-green-400" />
          <h2 className="text-lg font-semibold text-white">Attendance</h2>
        </div>

        {/* Cooldown */}
        <div>
          <label className="block text-sm text-gray-300 mb-1.5">
            Cooldown Period (seconds)
          </label>
          <input
            type="number"
            value={config.attendance.cooldown_seconds}
            onChange={(e) =>
              updateNested(
                'attendance',
                'cooldown_seconds',
                parseInt(e.target.value, 10) || 0
              )
            }
            min="0"
            max="3600"
            className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Minimum seconds between duplicate attendance entries for the same
            student.
          </p>
        </div>

        {/* Auto capture */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-300">Auto Capture</p>
            <p className="text-xs text-gray-500">
              Automatically mark attendance when a face is recognized
            </p>
          </div>
          <Toggle
            enabled={config.attendance.auto_capture_enabled}
            onChange={(v) =>
              updateNested('attendance', 'auto_capture_enabled', v)
            }
          />
        </div>

        {/* Save snapshots */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-300">Save Snapshots</p>
            <p className="text-xs text-gray-500">
              Save face snapshots when attendance is recorded
            </p>
          </div>
          <Toggle
            enabled={config.attendance.save_snapshots}
            onChange={(v) => updateNested('attendance', 'save_snapshots', v)}
          />
        </div>
      </section>

      {/* Camera */}
      <section className="bg-gray-800 rounded-lg border border-gray-700/50 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Camera size={18} className="text-purple-400" />
          <h2 className="text-lg font-semibold text-white">Camera</h2>
        </div>

        {/* Frame skip */}
        <div>
          <label className="block text-sm text-gray-300 mb-1.5">
            Frame Skip ({config.camera.frame_skip === 0 ? 'Full Stream' : config.camera.frame_skip})
          </label>
          <input
            type="range"
            min="0"
            max="10"
            step="1"
            value={config.camera.frame_skip}
            onChange={(e) =>
              updateNested(
                'camera',
                'frame_skip',
                parseInt(e.target.value, 10)
              )
            }
            className="w-full accent-purple-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0 (full stream)</span>
            <span>10 (skip 9)</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {config.camera.frame_skip === 0
              ? 'Full stream mode: face recognition runs on every frame. Higher CPU usage.'
              : 'Process every Nth frame. Higher values reduce CPU usage.'}
          </p>
        </div>

        {/* JPEG quality */}
        <div>
          <label className="block text-sm text-gray-300 mb-1.5">
            JPEG Quality ({config.camera.jpeg_quality}%)
          </label>
          <input
            type="range"
            min="50"
            max="100"
            step="1"
            value={config.camera.jpeg_quality}
            onChange={(e) =>
              updateNested(
                'camera',
                'jpeg_quality',
                parseInt(e.target.value, 10)
              )
            }
            className="w-full accent-purple-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>50% (smaller)</span>
            <span>100% (best)</span>
          </div>
        </div>

        {/* Max resolution */}
        <div>
          <label className="block text-sm text-gray-300 mb-1.5">
            Max Resolution
          </label>
          <select
            value={resolutionValue}
            onChange={(e) => handleResolutionChange(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="320x240">320x240</option>
            <option value="640x480">640x480</option>
            <option value="1280x720">1280x720 (HD)</option>
            <option value="1920x1080">1920x1080 (Full HD)</option>
          </select>
        </div>
      </section>

      {/* ESP32 TFT */}
      <section className="bg-gray-800 rounded-lg border border-gray-700/50 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Monitor size={18} className="text-orange-400" />
          <h2 className="text-lg font-semibold text-white">ESP32 TFT</h2>
        </div>

        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-300">Enable ESP32 TFT Display</p>
            <p className="text-xs text-gray-500">
              Send attendance status to an ESP32 TFT display
            </p>
          </div>
          <Toggle
            enabled={config.esp32_tft.enabled}
            onChange={(v) => updateNested('esp32_tft', 'enabled', v)}
          />
        </div>

        {/* URL input */}
        <div>
          <label className="block text-sm text-gray-300 mb-1.5">
            ESP32 TFT URL
          </label>
          <input
            type="text"
            value={config.esp32_tft.url || ''}
            onChange={(e) => updateNested('esp32_tft', 'url', e.target.value)}
            placeholder="http://192.168.1.100"
            disabled={!config.esp32_tft.enabled}
            className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-500 disabled:opacity-50"
          />
        </div>

        {/* Test connection */}
        <button
          type="button"
          onClick={handleTestEsp32}
          disabled={!config.esp32_tft.enabled || esp32Testing}
          className="flex items-center gap-2 text-sm font-medium text-orange-400 hover:text-orange-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {esp32Testing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Wifi size={14} />
          )}
          Test Connection
        </button>

        {esp32Status && (
          <div
            className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
              esp32Status.ok
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}
          >
            {esp32Status.ok ? <Wifi size={12} /> : <WifiOff size={12} />}
            {esp32Status.text}
          </div>
        )}
      </section>

      {/* Message toast */}
      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-3 rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        <button
          onClick={handleReset}
          disabled={saving}
          className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 px-6 py-3 rounded-lg text-sm font-medium transition-colors"
        >
          <RotateCcw size={16} />
          Reset to Defaults
        </button>
      </div>
    </div>
  )
}

export default Settings
