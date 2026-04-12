import { useState, useEffect, useRef } from 'react'
import { RefreshCw, Wifi, WifiOff, Plus, X } from 'lucide-react'
import useAppStore from '../store/appStore'
import { getDevices, connectDevice, disconnectDevice, addNetworkCamera, getActiveDevice } from '../services/api'

function DeviceSelector() {
  const { devices, activeDevice, setDevices, setActiveDevice } = useAppStore()
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showNetworkForm, setShowNetworkForm] = useState(false)
  const [networkForm, setNetworkForm] = useState({
    url: '',
    name: '',
    type: 'esp32',
  })
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)
  const initDone = useRef(false)

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

  // On mount: fetch devices, check active, auto-connect to ensure frame processor runs
  useEffect(() => {
    if (initDone.current) return
    initDone.current = true

    ;(async () => {
      // Fetch device list
      let deviceList = []
      try {
        const data = await getDevices()
        deviceList = data.devices || data || []
        setDevices(deviceList)
      } catch (err) {
        console.error('Failed to fetch devices:', err)
      }

      // Check for active device and ensure frame processor is running
      let targetId = null
      let targetName = null
      try {
        const result = await getActiveDevice()
        const active = result?.device || result
        if (active && active.id) {
          targetId = active.id
          targetName = active.name
        }
      } catch {
        // No active device
      }

      // If no active device, auto-select first available
      if (!targetId && deviceList.length > 0) {
        targetId = deviceList[0].id
        targetName = deviceList[0].name
      }

      // Connect (idempotent — also starts frame processor if not running)
      if (targetId) {
        try {
          await connectDevice(targetId)
          setActiveDevice({ id: targetId, name: targetName || targetId })
          setSelectedDeviceId(targetId)
        } catch (err) {
          console.error('Auto-connect failed:', err)
        }
      }
    })()
  }, [setDevices, setActiveDevice])

  const handleConnect = async () => {
    if (!selectedDeviceId) return
    setLoading(true)
    try {
      await connectDevice(selectedDeviceId)
      const device = devices.find((d) => d.id === selectedDeviceId)
      setActiveDevice(device || { id: selectedDeviceId, name: selectedDeviceId })
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
      setSelectedDeviceId('')
    } catch (err) {
      console.error('Failed to disconnect:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddNetworkCamera = async (e) => {
    e.preventDefault()
    if (!networkForm.url || !networkForm.name) return
    setAddError('')
    setAdding(true)

    // Auto-format URL: if user enters just an IP, build the full URL
    let url = networkForm.url.trim()
    if (networkForm.type === 'esp32') {
      // If just an IP like "192.168.1.100", build ESP32-CAM MJPEG URL
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(url)) {
        url = `http://${url}:81/stream`
      } else if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(url)) {
        url = `http://${url}/stream`
      } else if (!url.startsWith('http')) {
        url = `http://${url}`
      }
    } else if (!url.startsWith('http') && !url.startsWith('rtsp')) {
      url = `http://${url}`
    }

    try {
      await addNetworkCamera({ ...networkForm, url })
      setNetworkForm({ url: '', name: '', type: 'esp32' })
      setShowNetworkForm(false)
      // Refresh device list to show the new camera
      const data = await getDevices()
      setDevices(data.devices || data || [])
    } catch (err) {
      setAddError(err.message || 'Failed to add camera. Check the URL and ensure the camera is reachable.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {/* Device dropdown */}
        <select
          value={activeDevice ? activeDevice.id : selectedDeviceId}
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
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
          <form onSubmit={handleAddNetworkCamera} className="flex items-end gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Type</label>
              <select
                value={networkForm.type}
                onChange={(e) =>
                  setNetworkForm({ ...networkForm, type: e.target.value, url: '' })
                }
                className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="esp32">ESP32-CAM</option>
                <option value="ip">IP Camera (HTTP)</option>
                <option value="rtsp">RTSP Stream</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">
                {networkForm.type === 'esp32' ? 'IP Address' : 'Stream URL'}
              </label>
              <input
                type="text"
                value={networkForm.url}
                onChange={(e) =>
                  setNetworkForm({ ...networkForm, url: e.target.value })
                }
                placeholder={
                  networkForm.type === 'esp32'
                    ? '192.168.1.100'
                    : networkForm.type === 'rtsp'
                    ? 'rtsp://192.168.1.100:554/stream'
                    : 'http://192.168.1.100:8080/video'
                }
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1 max-w-xs">
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={networkForm.name}
                onChange={(e) =>
                  setNetworkForm({ ...networkForm, name: e.target.value })
                }
                placeholder="My ESP32 Camera"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={adding || !networkForm.url || !networkForm.name}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
            >
              {adding ? 'Testing...' : 'Add Camera'}
            </button>
          </form>
          {networkForm.type === 'esp32' && (
            <p className="text-xs text-gray-500">
              Just enter the IP address of your ESP32-CAM. The stream URL (http://IP:81/stream) will be built automatically.
            </p>
          )}
          {addError && (
            <p className="text-red-400 text-xs">{addError}</p>
          )}
        </div>
      )}

      {/* Active device indicator */}
      {activeDevice && (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          Connected
        </div>
      )}
    </div>
  )
}

export default DeviceSelector
