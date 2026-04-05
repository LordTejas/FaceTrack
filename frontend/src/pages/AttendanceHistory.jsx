import { useState, useEffect, useMemo } from 'react'
import { Search, Download, BarChart3 } from 'lucide-react'
import { getAttendance, getSessions, exportAttendance } from '../services/api'
import AttendanceTable from '../components/AttendanceTable'

function AttendanceHistory() {
  const [records, setRecords] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [filters, setFilters] = useState({
    date_from: '',
    date_to: '',
    session_id: '',
    search: '',
  })

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const data = await getSessions()
        setSessions(data.sessions || data || [])
      } catch (err) {
        console.error('Failed to fetch sessions:', err)
      }
    }
    fetchSessions()
  }, [])

  useEffect(() => {
    const fetchRecords = async () => {
      setLoading(true)
      try {
        const params = {}
        if (filters.date_from) params.date_from = filters.date_from
        if (filters.date_to) params.date_to = filters.date_to
        if (filters.session_id) params.session_id = filters.session_id
        if (filters.search) params.search = filters.search
        const data = await getAttendance(params)
        setRecords(data.records || data || [])
      } catch (err) {
        console.error('Failed to fetch attendance:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchRecords()
  }, [filters])

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await exportAttendance(filters)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attendance-export-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export:', err)
    } finally {
      setExporting(false)
    }
  }

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
  }

  // Summary stats
  const stats = useMemo(() => {
    if (!records.length) return { total: 0, avgConfidence: 0 }
    const total = records.length
    const confidenceValues = records.filter((r) => r.confidence != null).map((r) => r.confidence)
    const avgConfidence =
      confidenceValues.length > 0
        ? confidenceValues.reduce((sum, c) => sum + c, 0) / confidenceValues.length
        : 0
    return { total, avgConfidence }
  }, [records])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Attendance History</h1>
          <p className="text-gray-400 text-sm mt-1">
            View and export attendance records
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || loading}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          <Download size={16} />
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Summary Stats */}
      {!loading && records.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="bg-gray-800 border border-gray-700/50 rounded-lg px-4 py-3 flex items-center gap-3">
            <BarChart3 size={18} className="text-blue-400" />
            <div>
              <p className="text-xs text-gray-400">Total Records</p>
              <p className="text-white font-semibold">{stats.total}</p>
            </div>
          </div>
          <div className="bg-gray-800 border border-gray-700/50 rounded-lg px-4 py-3 flex items-center gap-3">
            <BarChart3 size={18} className="text-green-400" />
            <div>
              <p className="text-xs text-gray-400">Avg Confidence</p>
              <p className="text-white font-semibold">
                {(stats.avgConfidence * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">From</label>
          <input
            type="date"
            value={filters.date_from}
            onChange={(e) => handleFilterChange('date_from', e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">To</label>
          <input
            type="date"
            value={filters.date_to}
            onChange={(e) => handleFilterChange('date_to', e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Session</label>
          <select
            value={filters.session_id}
            onChange={(e) => handleFilterChange('session_id', e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All sessions</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.id}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-400 mb-1">Search</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="Search by name or ID..."
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <AttendanceTable data={records} isLoading={loading} />
    </div>
  )
}

export default AttendanceHistory
