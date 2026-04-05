import { useState, useEffect, useCallback } from 'react'
import {
  getDevices,
  getActiveDevice,
  connectDevice,
  disconnectDevice,
  addNetworkCamera,
  deleteDevice,
} from '../services/api'
import useAppStore from '../store/appStore'

/**
 * Custom hook that encapsulates camera/device logic.
 *
 * Provides the device list, the currently active device, loading state,
 * and methods to connect, disconnect, add/remove network cameras, and
 * refresh the device list.
 */
export default function useCamera() {
  const [devices, setLocalDevices] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const storeDevices = useAppStore((s) => s.devices)
  const storeActiveDevice = useAppStore((s) => s.activeDevice)
  const setStoreDevices = useAppStore((s) => s.setDevices)
  const setStoreActiveDevice = useAppStore((s) => s.setActiveDevice)

  // Fetch device list and active device from the backend
  const refreshDevices = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [deviceList, activeResp] = await Promise.all([
        getDevices(),
        getActiveDevice(),
      ])
      setLocalDevices(deviceList)
      setStoreDevices(deviceList)

      if (activeResp.active && activeResp.device) {
        setStoreActiveDevice(activeResp.device)
      } else {
        setStoreActiveDevice(null)
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch devices')
      console.error('useCamera: failed to refresh devices', err)
    } finally {
      setIsLoading(false)
    }
  }, [setStoreDevices, setStoreActiveDevice])

  // Fetch on mount
  useEffect(() => {
    refreshDevices()
  }, [refreshDevices])

  // Keep local state in sync with store (for external updates)
  useEffect(() => {
    setLocalDevices(storeDevices)
  }, [storeDevices])

  /**
   * Connect to a camera by device ID.
   * Starts the frame processor on the backend.
   */
  const connect = useCallback(
    async (deviceId) => {
      setError(null)
      try {
        await connectDevice(deviceId)
        // Refresh to get the updated active device
        const [deviceList, activeResp] = await Promise.all([
          getDevices(),
          getActiveDevice(),
        ])
        setLocalDevices(deviceList)
        setStoreDevices(deviceList)
        if (activeResp.active && activeResp.device) {
          setStoreActiveDevice(activeResp.device)
        }
      } catch (err) {
        setError(err.message || 'Failed to connect to device')
        throw err
      }
    },
    [setStoreDevices, setStoreActiveDevice]
  )

  /**
   * Disconnect the currently active camera.
   * Stops the frame processor on the backend.
   */
  const disconnect = useCallback(async () => {
    setError(null)
    try {
      await disconnectDevice()
      setStoreActiveDevice(null)
    } catch (err) {
      setError(err.message || 'Failed to disconnect device')
      throw err
    }
  }, [setStoreActiveDevice])

  /**
   * Add a new network / IP camera.
   * @param {{ name: string, url: string, type?: string }} data
   */
  const addCamera = useCallback(
    async (data) => {
      setError(null)
      try {
        const newDevice = await addNetworkCamera(data)
        // Refresh the full list
        await refreshDevices()
        return newDevice
      } catch (err) {
        setError(err.message || 'Failed to add network camera')
        throw err
      }
    },
    [refreshDevices]
  )

  /**
   * Remove a network camera by ID.
   * @param {string} id
   */
  const removeCamera = useCallback(
    async (id) => {
      setError(null)
      try {
        await deleteDevice(id)
        await refreshDevices()
      } catch (err) {
        setError(err.message || 'Failed to remove camera')
        throw err
      }
    },
    [refreshDevices]
  )

  return {
    devices,
    activeDevice: storeActiveDevice,
    isLoading,
    error,
    connect,
    disconnect,
    addNetworkCamera: addCamera,
    removeNetworkCamera: removeCamera,
    refreshDevices,
  }
}
