import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

function StudentForm({ onSubmit, onCancel, initialData }) {
  const isEditMode = !!initialData
  const [form, setForm] = useState({
    student_id: '',
    name: '',
    age: '',
  })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (initialData) {
      setForm({
        student_id: initialData.student_id || '',
        name: initialData.name || '',
        age: initialData.age != null ? String(initialData.age) : '',
      })
    }
  }, [initialData])

  const validate = () => {
    const newErrors = {}
    if (!form.student_id.trim()) {
      newErrors.student_id = 'Student ID is required'
    }
    if (!form.name.trim()) {
      newErrors.name = 'Name is required'
    }
    if (form.age && (isNaN(Number(form.age)) || Number(form.age) < 1 || Number(form.age) > 150)) {
      newErrors.age = 'Age must be between 1 and 150'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }))
    }
    if (submitError) {
      setSubmitError('')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    setSubmitError('')
    try {
      await onSubmit({
        id: form.student_id.trim(),
        name: form.name.trim(),
        age: form.age ? parseInt(form.age, 10) : undefined,
      })
    } catch (err) {
      setSubmitError(err.message || 'An error occurred while saving.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Student ID */}
      <div>
        <label htmlFor="student_id" className="block text-sm text-gray-400 mb-1">
          Student ID
        </label>
        <input
          id="student_id"
          name="student_id"
          type="text"
          value={form.student_id}
          onChange={handleChange}
          disabled={isEditMode || submitting}
          placeholder="e.g. STU001"
          className="bg-gray-800 border border-gray-700 text-white rounded-lg p-3 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {errors.student_id && (
          <p className="text-red-400 text-xs mt-1">{errors.student_id}</p>
        )}
      </div>

      {/* Name */}
      <div>
        <label htmlFor="name" className="block text-sm text-gray-400 mb-1">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          value={form.name}
          onChange={handleChange}
          disabled={submitting}
          placeholder="Full name"
          className="bg-gray-800 border border-gray-700 text-white rounded-lg p-3 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500 disabled:opacity-50"
        />
        {errors.name && (
          <p className="text-red-400 text-xs mt-1">{errors.name}</p>
        )}
      </div>

      {/* Age */}
      <div>
        <label htmlFor="age" className="block text-sm text-gray-400 mb-1">
          Age (optional)
        </label>
        <input
          id="age"
          name="age"
          type="number"
          value={form.age}
          onChange={handleChange}
          disabled={submitting}
          placeholder="Optional"
          min="1"
          max="150"
          className="bg-gray-800 border border-gray-700 text-white rounded-lg p-3 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500 disabled:opacity-50"
        />
        {errors.age && (
          <p className="text-red-400 text-xs mt-1">{errors.age}</p>
        )}
      </div>

      {/* Submit error */}
      {submitError && (
        <div className="bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg p-3 text-sm">
          {submitError}
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 px-6 rounded-lg text-sm transition-colors"
        >
          {submitting && <Loader2 size={16} className="animate-spin" />}
          {submitting
            ? isEditMode
              ? 'Saving...'
              : 'Creating...'
            : isEditMode
            ? 'Save Changes'
            : 'Create Student'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 font-medium py-2.5 px-6 rounded-lg text-sm transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

export default StudentForm
