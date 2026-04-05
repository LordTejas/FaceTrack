import { useState } from 'react'
import { UserPlus, CheckCircle, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { createStudent } from '../services/api'
import StudentForm from '../components/StudentForm'
import SampleCapture from '../components/SampleCapture'

const STEP_FORM = 'form'
const STEP_SAMPLES = 'samples'
const STEP_DONE = 'done'

function StudentRegistration() {
  const [step, setStep] = useState(STEP_FORM)
  const [createdStudent, setCreatedStudent] = useState(null)

  const handleFormSubmit = async (studentData) => {
    const result = await createStudent(studentData)
    const student = result.student || result
    setCreatedStudent(student)
    setStep(STEP_SAMPLES)
  }

  const handleSamplesComplete = () => {
    setStep(STEP_DONE)
  }

  const handleReset = () => {
    setStep(STEP_FORM)
    setCreatedStudent(null)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Register Student</h1>
        <p className="text-gray-400 text-sm mt-1">
          Add a new student to the recognition system
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-3 text-sm">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
            step === STEP_FORM
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
              : 'bg-gray-800 text-gray-500 border border-gray-700'
          }`}
        >
          <span className="font-medium">1</span>
          <span>Student Info</span>
        </div>
        <ArrowRight size={14} className="text-gray-600" />
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
            step === STEP_SAMPLES
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
              : 'bg-gray-800 text-gray-500 border border-gray-700'
          }`}
        >
          <span className="font-medium">2</span>
          <span>Face Samples</span>
        </div>
        <ArrowRight size={14} className="text-gray-600" />
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
            step === STEP_DONE
              ? 'bg-green-600/20 text-green-400 border border-green-500/30'
              : 'bg-gray-800 text-gray-500 border border-gray-700'
          }`}
        >
          <span className="font-medium">3</span>
          <span>Complete</span>
        </div>
      </div>

      {/* Step: Form */}
      {step === STEP_FORM && (
        <div className="max-w-lg">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-5">
              <UserPlus size={20} className="text-blue-400" />
              <h2 className="text-lg font-semibold text-white">Student Information</h2>
            </div>
            <StudentForm onSubmit={handleFormSubmit} />
          </div>
        </div>
      )}

      {/* Step: Samples */}
      {step === STEP_SAMPLES && createdStudent && (
        <div>
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 mb-6 max-w-lg">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-green-400" />
              <p className="text-green-300 text-sm">
                Student <strong>{createdStudent.name}</strong> ({createdStudent.id}) created.
                Now capture face samples.
              </p>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Capture Face Samples</h2>
            <SampleCapture
              studentId={createdStudent.id}
              onComplete={handleSamplesComplete}
            />
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === STEP_DONE && createdStudent && (
        <div className="max-w-lg">
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6 text-center">
            <CheckCircle size={48} className="text-green-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Registration Complete</h2>
            <p className="text-gray-400 text-sm mb-6">
              <strong className="text-white">{createdStudent.name}</strong> ({createdStudent.id})
              has been registered with face samples. You can now train the model to include this student.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                to="/students"
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-6 rounded-lg text-sm transition-colors"
              >
                View Students
              </Link>
              <Link
                to="/training"
                className="bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium py-2.5 px-6 rounded-lg text-sm transition-colors"
              >
                Go to Training
              </Link>
              <button
                onClick={handleReset}
                className="bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium py-2.5 px-6 rounded-lg text-sm transition-colors"
              >
                Register Another
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default StudentRegistration
