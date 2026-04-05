import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search,
  Users,
  Edit3,
  Trash2,
  Eye,
  Camera,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { getStudents, updateStudent, deleteStudent, getStudentSamples, deleteSample } from '../services/api'
import StudentForm from '../components/StudentForm'
import SampleCapture from '../components/SampleCapture'

const PAGE_SIZE = 10

function StudentsList() {
  const [students, setStudents] = useState([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Edit modal
  const [editingStudent, setEditingStudent] = useState(null)

  // Delete confirmation
  const [deletingStudent, setDeletingStudent] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // View samples
  const [viewingSamples, setViewingSamples] = useState(null)
  const [samples, setSamples] = useState([])
  const [samplesLoading, setSamplesLoading] = useState(false)
  const [deletingSampleId, setDeletingSampleId] = useState(null)

  // Manage samples (capture new ones for existing student)
  const [managingSamples, setManagingSamples] = useState(null)

  const debounceRef = useRef(null)

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  // Fetch students
  const fetchStudents = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      }
      if (debouncedSearch) params.search = debouncedSearch
      const data = await getStudents(params)
      setStudents(data.students || data || [])
      setTotalCount(data.total ?? (data.students || data || []).length)
    } catch (err) {
      console.error('Failed to fetch students:', err)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, page])

  useEffect(() => {
    fetchStudents()
  }, [fetchStudents])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  // Edit handlers
  const handleEditSubmit = async (formData) => {
    await updateStudent(editingStudent.id, {
      name: formData.name,
      age: formData.age,
    })
    setEditingStudent(null)
    fetchStudents()
  }

  // Delete handlers
  const handleDeleteConfirm = async () => {
    if (!deletingStudent) return
    setDeleteLoading(true)
    try {
      await deleteStudent(deletingStudent.id)
      setDeletingStudent(null)
      fetchStudents()
    } catch (err) {
      console.error('Failed to delete student:', err)
    } finally {
      setDeleteLoading(false)
    }
  }

  // View samples
  const handleViewSamples = async (student) => {
    setViewingSamples(student)
    setSamplesLoading(true)
    setSamples([])
    try {
      const data = await getStudentSamples(student.id)
      setSamples(data.samples || data || [])
    } catch (err) {
      console.error('Failed to fetch samples:', err)
    } finally {
      setSamplesLoading(false)
    }
  }

  // Delete a single sample
  const handleDeleteSample = async (sampleId) => {
    if (!viewingSamples) return
    setDeletingSampleId(sampleId)
    try {
      await deleteSample(viewingSamples.id, sampleId)
      setSamples((prev) => prev.filter((s) => (s.id || s.sample_id) !== sampleId))
      fetchStudents() // refresh sample count
    } catch (err) {
      console.error('Failed to delete sample:', err)
    } finally {
      setDeletingSampleId(null)
    }
  }

  // Manage samples complete
  const handleManageSamplesComplete = () => {
    setManagingSamples(null)
    fetchStudents()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Students</h1>
        <p className="text-gray-400 text-sm mt-1">
          Manage registered students and their face samples
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search students..."
          className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500"
        />
      </div>

      {/* Table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-gray-300 font-medium px-4 py-3">ID</th>
                <th className="text-left text-gray-300 font-medium px-4 py-3">Name</th>
                <th className="text-left text-gray-300 font-medium px-4 py-3">Age</th>
                <th className="text-left text-gray-300 font-medium px-4 py-3">Samples</th>
                <th className="text-left text-gray-300 font-medium px-4 py-3">Registered</th>
                <th className="text-left text-gray-300 font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-700/50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div
                          className="h-4 bg-gray-700 rounded animate-pulse"
                          style={{ width: `${50 + Math.random() * 40}%` }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Users size={32} className="text-gray-600" />
                      <p className="text-gray-500">
                        {debouncedSearch ? 'No students match your search' : 'No students registered yet'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                students.map((student) => (
                  <tr
                    key={student.id}
                    className="border-b border-gray-700/50 hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-white font-mono text-xs">
                      {student.id}
                    </td>
                    <td className="px-4 py-3 text-white">{student.name}</td>
                    <td className="px-4 py-3 text-gray-400">{student.age || '--'}</td>
                    <td className="px-4 py-3 text-gray-400">{student.sample_count ?? '--'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {student.created_at
                        ? new Date(student.created_at).toLocaleDateString()
                        : '--'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingStudent(student)}
                          className="text-blue-400 hover:text-blue-300 transition-colors p-1"
                          title="Edit"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => handleViewSamples(student)}
                          className="text-gray-400 hover:text-gray-300 transition-colors p-1"
                          title="View samples"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          onClick={() => setManagingSamples(student)}
                          className="text-green-400 hover:text-green-300 transition-colors p-1"
                          title="Add/manage samples"
                        >
                          <Camera size={14} />
                        </button>
                        <button
                          onClick={() => setDeletingStudent(student)}
                          className="text-red-400 hover:text-red-300 transition-colors p-1"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && students.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700">
            <span className="text-gray-400 text-xs">
              Showing {(page - 1) * PAGE_SIZE + 1}--{Math.min(page * PAGE_SIZE, totalCount)} of{' '}
              {totalCount} students
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white p-1.5 rounded transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-gray-400 text-xs px-2">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white p-1.5 rounded transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">Edit Student</h2>
              <button
                onClick={() => setEditingStudent(null)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <StudentForm
              initialData={editingStudent}
              onSubmit={handleEditSubmit}
              onCancel={() => setEditingStudent(null)}
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-500/20 p-2 rounded-lg">
                <AlertCircle size={20} className="text-red-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Delete Student</h2>
            </div>
            <p className="text-gray-400 text-sm mb-6">
              Are you sure you want to delete{' '}
              <strong className="text-white">{deletingStudent.name}</strong> ({deletingStudent.id})?
              This action cannot be undone. All face samples will also be removed.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setDeletingStudent(null)}
                disabled={deleteLoading}
                className="bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium py-2 px-4 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
              >
                {deleteLoading && <Loader2 size={14} className="animate-spin" />}
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Samples Modal (with delete per sample) */}
      {viewingSamples && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">
                Samples: {viewingSamples.name}
              </h2>
              <button
                onClick={() => {
                  setViewingSamples(null)
                  setSamples([])
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            {samplesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={24} className="animate-spin text-gray-400" />
              </div>
            ) : samples.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">
                No face samples captured for this student.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {samples.map((sample) => {
                  const sampleId = sample.id || sample.sample_id
                  const imgPath = sample.sample_image_path || sample.path
                  return (
                    <div
                      key={sampleId}
                      className="relative group aspect-square bg-gray-800 rounded-lg border border-gray-700 overflow-hidden"
                    >
                      {imgPath && (
                        <img
                          src={`/data/${imgPath}`}
                          alt={`Sample ${sampleId}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none'
                          }}
                        />
                      )}
                      <button
                        onClick={() => handleDeleteSample(sampleId)}
                        disabled={deletingSampleId === sampleId}
                        className="absolute top-1 right-1 bg-red-600/80 hover:bg-red-600 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                        title="Delete sample"
                      >
                        {deletingSampleId === sampleId ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <X size={12} />
                        )}
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-gray-300 text-[10px] text-center py-0.5">
                        #{sampleId}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-gray-500">
                {samples.length} sample{samples.length !== 1 ? 's' : ''} captured
              </span>
              <button
                onClick={() => {
                  setViewingSamples(null)
                  setSamples([])
                  setManagingSamples(viewingSamples)
                }}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-colors"
              >
                <Camera size={12} />
                Capture More
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Samples Modal (capture new samples for existing student) */}
      {managingSamples && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">
                Capture Samples: {managingSamples.name} ({managingSamples.id})
              </h2>
              <button
                onClick={handleManageSamplesComplete}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <SampleCapture
              studentId={managingSamples.id}
              onComplete={handleManageSamplesComplete}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default StudentsList
