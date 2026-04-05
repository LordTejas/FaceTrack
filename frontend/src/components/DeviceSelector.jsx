import { useState, useEffect } from 'react'
import { RefreshCw, Wifi, WifiOff, Plus, X } from 'lucide-react'
import useAppStore from '../store/appStore'
import { getDevices, connectDevice, disconnectDevice, addNetworkCamera } from '../services/api'

function DeviceSelector() {
  const { devices, activeDevice, setDevices, setActiveDevice } = useAppStore()
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showNetworkForm, setShowNetworkForm] = useState(false)
  const [networkForm, setNetworkForm] = useState({
    url: '',
    name: '',
    type: 'ip_camera',
  })

  const fetchDevices = async () => {
    setRefreshing(true)
    try {
      const data = await getDevices()
      setDevices(data.devices || data || [])
    } catch (err) {
      console.error('Failed to fetch devices:', err)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchDevices()
  }, [])

  const handleConnect = async () => {
    if (!selectedDeviceId) return
    setLoading(true)
    try {
      const result = await connectDevice(selectedDeviceId)
      setActiveDevice(result.device || result)
    } catch (err) {
      console.error('Failed to connect:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    setLoading(true)
    try {
      await disconnectDevice()
      setActiveDevice(null)
    } catch (err) {
      console.error('Failed to disconnect:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddNetworkCamera = async (e) => {
    e.preventDefault()
    if (!networkForm.url || !networkForm.name) return
    try {
      await addNetworkCamera(networkForm)
      setNetworkForm({ url: '', name: '', type: 'ip_camera' })
      setShowNetworkForm(false)
      fetchDevices()
    } catch (err) {
      console.error('Failed to add network camera:', err)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {/* Device dropdown */}
        <select
          value={selectedDeviceId}
          onChange={(e) => setSelectedDeviceId(e.target.value)}
          disabled={!!activeDevice || loading}
          className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
        >
          <option value="">Select a device...</option>
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name || device.id}
            </option>
          ))}
        </select>

        {/* Connect / Disconnect */}
        {activeDevice ? (
          <button
            onClick={handleDisconnect}
            disabled={loading}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <WifiOff size={16} />
            {loading ? 'Disconnecting...' : 'Disconnect'}
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={!selectedDeviceId || loading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Wifi size={16} />
            {loading ? 'Connecting...' : 'Connect'}
          </button>
        )}

        {/* Refresh */}
        <button
          onClick={fetchDevices}
          disabled={refreshing}
          className="bg-gray-800 hover:bg-gray-700 text-gray-300 p-2.5 rounded-lg transition-colors border border-gray-700"
          title="Refresh devices"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>

        {/* Add Network Camera toggle */}
        <button
          onClick={() => setShowNetworkForm(!showNetworkForm)}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2.5 rounded-lg text-sm transition-colors border border-gray-700"
        >
          {showNetworkForm ? <X size={16} /> : <Plus size={16} />}
          <span className="hidden sm:inline">
            {showNetworkForm ? 'Cancel' : 'Add Network Camera'}
          </span>
        </button>
      </div>

      {/* Network camera form */}
      {showNetworkForm && (
        <form
          onSubmit={handleAddNetworkCamera}
          className="flex items-end gap-3 bg-gray-800/50 border border-gray-700 rounded-lg p-4"
        >
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">Camera URL</label>
            <input
              type="text"
              value={networkForm.url}
              onChange={(e) =>
                setNetworkForm({ ...networkForm, url: e.target.value })
              }
              placeholder="rtsp://192.168.1.100:554/stream"
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={networkForm.name}
              onChange={(e) =>
                setNetworkForm({ ...networkForm, name: e.target.value })
              }
              placeholder="Front Door Camera"
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Type</label>
            <select
              value={networkForm.type}
              onChange={(e) =>
                setNetworkForm({ ...networkForm, type: e.target.value })
              }
              className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ip_camera">IP Camera</option>
              <option value="esp32">ESP32-CAM</option>
              <option value="rtsp">RTSP Stream</option>
            </select>
          </div>
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Add
          </button>
        </form>
      )}

      {/* Active device indicator */}
      {activeDevice && (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          Connected to: {activeDevice.name || activeDevice.id}
        </div>
      )}
    </div>
  )
}

export default DeviceSelector
