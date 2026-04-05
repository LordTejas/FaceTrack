import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  UserCheck,
  Activity,
  ArrowRight,
  RefreshCw,
  Wifi,
  WifiOff,
  Clock,
  ShieldCheck,
} from 'lucide-react'
import { getStudents, getAttendance, getSessions } from '../services/api'
import useAppStore from '../store/appStore'

const REFRESH_INTERVAL = 30_000

function Dashboard() {
  const [totalStudents, setTotalStudents] = useState(0)
  const [todayCount, setTodayCount] = useState(0)
  const [activeSession, setActiveSession] = useState(null)
  const [recentRecords, setRecentRecords] = useState([])
  const [loading, setLoading] = useState(true)

  const isBackendConnected = useAppStore((s) => s.isBackendConnected)

  const todayISO = new Date().toISOString().split('T')[0]

  const fetchData = useCallback(async () => {
    try {
      const [students, attendance, sessions] = await Promise.allSettled([
        getStudents({ limit: 1 }),
        getAttendance({ date_from: todayISO, limit: 100 }),
        getSessions(),
      ])

      // Total students -- the list endpoint returns all matching rows up to limit,
      // so we fetch a large page to count. For an overview we'll re-fetch with
      // a high limit. The first call with limit=1 is just a quick probe; we issue
      // a second call to get actual count.
      if (students.status === 'fulfilled') {
        // Re-fetch with a high limit to get a realistic count
        try {
          const allStudents = await getStudents({ limit: 9999 })
          setTotalStudents(allStudents.length)
        } catch {
          setTotalStudents(0)
        }
      }

      // Today's attendance count
      if (attendance.status === 'fulfilled') {
        const records = attendance.value
        setTodayCount(records.length)
        // Recent 10 records sorted by most recent first (API returns in order)
        setRecentRecords(records.slice(0, 10))
      }

      // Active session -- find one with status "active"
      if (sessions.status === 'fulfilled') {
        const active = sessions.value.find((s) => s.status === 'active') || null
        setActiveSession(active)
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [todayISO])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchData])

  const stats = [
    {
      label: 'Total Students',
      value: loading ? '--' : String(totalStudents),
      icon: Users,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      label: "Today's Attendance",
      value: loading ? '--' : String(todayCount),
      icon: UserCheck,
      color: 'text-green-400',
      bg: 'bg-green-500/10',
    },
    {
      label: 'Active Session',
      value: loading
        ? '--'
        : activeSession
        ? activeSession.name
        : 'None',
      icon: Activity,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
    },
  ]

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const d = new Date(timestamp)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const confidenceBadge = (confidence) => {
    if (confidence == null) return null
    const pct = Math.round(confidence * 100)
    let colorClass = 'bg-red-500/20 text-red-400'
    if (pct >= 80) colorClass = 'bg-green-500/20 text-green-400'
    else if (pct >= 60) colorClass = 'bg-yellow-500/20 text-yellow-400'
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${colorClass}`}
      >
        <ShieldCheck size={12} />
        {pct}%
      </span>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">
            Overview of your attendance system
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* WebSocket status */}
          <div
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full ${
              isBackendConnected
                ? 'bg-green-500/10 text-green-400'
                : 'bg-red-500/10 text-red-400'
            }`}
          >
            {isBackendConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {isBackendConnected ? 'Live' : 'Disconnected'}
          </div>
          <button
            onClick={() => {
              setLoading(true)
              fetchData()
            }}
            className="p-2 text-gray-400 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div
            key={label}
            className="bg-gray-800 rounded-lg p-6 border border-gray-700/50"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">{label}</p>
                <p className="text-3xl font-bold text-white mt-1">{value}</p>
              </div>
              <div className={`p-3 rounded-lg ${bg}`}>
                <Icon size={24} className={color} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          to="/live"
          className="flex items-center justify-between bg-blue-600 hover:bg-blue-700 rounded-lg p-5 transition-colors group"
        >
          <div>
            <h3 className="text-lg font-semibold text-white">
              Start Attendance
            </h3>
            <p className="text-blue-200 text-sm mt-0.5">
              Open the live camera feed and begin tracking
            </p>
          </div>
          <ArrowRight
            size={20}
            className="text-blue-200 group-hover:translate-x-1 transition-transform"
          />
        </Link>

        <Link
          to="/register"
          className="flex items-center justify-between bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg p-5 transition-colors group"
        >
          <div>
            <h3 className="text-lg font-semibold text-white">
              Register Student
            </h3>
            <p className="text-gray-400 text-sm mt-0.5">
              Add a new student and capture face samples
            </p>
          </div>
          <ArrowRight
            size={20}
            className="text-gray-400 group-hover:translate-x-1 transition-transform"
          />
        </Link>
      </div>

      {/* Recent activity */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">
          Recent Activity
        </h2>
        {recentRecords.length === 0 ? (
          <div className="bg-gray-800 rounded-lg border border-gray-700/50 p-8">
            <p className="text-gray-500 text-sm text-center">
              No recent activity. Start an attendance session to see events
              here.
            </p>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg border border-gray-700/50 divide-y divide-gray-700/50">
            {recentRecords.map((record, idx) => (
              <div
                key={record.id ?? idx}
                className="flex items-center justify-between px-5 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <UserCheck size={14} className="text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {record.student_name || record.student_id}
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock size={10} />
                      {formatTime(record.timestamp)}
                    </p>
                  </div>
                </div>
                {confidenceBadge(record.confidence)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard
