import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  Camera,
  UserPlus,
  Users,
  ClipboardList,
  Brain,
  Settings2,
} from 'lucide-react'
import useAppStore from '../store/appStore'
import useWebSocket from '../hooks/useWebSocket'
import AttendanceToast from './AttendanceToast'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/live', label: 'Live Attendance', icon: Camera },
  { to: '/register', label: 'Register Student', icon: UserPlus },
  { to: '/students', label: 'Students', icon: Users },
  { to: '/attendance', label: 'Attendance History', icon: ClipboardList },
  { to: '/training', label: 'Training', icon: Brain },
  { to: '/settings', label: 'Settings', icon: Settings2 },
]

function Layout() {
  const isBackendConnected = useAppStore((s) => s.isBackendConnected)
  // Global WebSocket connection — keeps video feed and events flowing on all pages
  useWebSocket()

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-gray-900 border-r border-gray-800 flex flex-col z-50">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-gray-800">
          <h1 className="text-xl font-bold text-white tracking-tight">
            <span className="text-blue-500">Face</span>Track
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Attendance Recognition System
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Backend status */}
        <div className="px-4 py-3 border-t border-gray-800">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${
                isBackendConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className={isBackendConnected ? 'text-green-400' : 'text-red-400'}>
              {isBackendConnected ? 'Backend connected' : 'Backend disconnected'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-64 flex-1 min-h-screen bg-gray-950 text-white p-6">
        <Outlet />
      </main>

      {/* Global attendance toasts — visible on all pages */}
      <AttendanceToast />
    </div>
  )
}

export default Layout
