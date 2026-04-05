import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import LiveAttendance from './pages/LiveAttendance'
import StudentRegistration from './pages/StudentRegistration'
import StudentsList from './pages/StudentsList'
import AttendanceHistory from './pages/AttendanceHistory'
import Training from './pages/Training'
import Settings from './pages/Settings'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/live" element={<LiveAttendance />} />
          <Route path="/register" element={<StudentRegistration />} />
          <Route path="/students" element={<StudentsList />} />
          <Route path="/attendance" element={<AttendanceHistory />} />
          <Route path="/training" element={<Training />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
