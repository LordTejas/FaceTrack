import { create } from 'zustand'

const useAppStore = create((set) => ({
  // Backend connection
  isBackendConnected: false,
  setBackendConnected: (v) => set({ isBackendConnected: v }),

  // Devices
  devices: [],
  activeDevice: null,
  setDevices: (d) => set({ devices: d }),
  setActiveDevice: (d) => set({ activeDevice: d }),

  // Camera feed
  lastFrame: null,
  lastFaces: [],
  setLastFrame: (data, faces) => set({ lastFrame: data, lastFaces: faces || [] }),

  // Session
  currentSession: null,
  setCurrentSession: (s) => set({ currentSession: s }),

  // Events
  recentEvents: [],
  addEvent: (event) =>
    set((state) => ({
      recentEvents: [event, ...state.recentEvents].slice(0, 20),
    })),

  // Students already marked in current session — skip confirmations for them
  markedStudents: new Set(),
  addMarkedStudent: (studentId) =>
    set((state) => {
      const next = new Set(state.markedStudents)
      next.add(studentId)
      return { markedStudents: next }
    }),
  clearMarkedStudents: () => set({ markedStudents: new Set() }),

  // Pending confirmations (uncertain matches)
  pendingConfirmations: [],
  addPendingConfirmation: (c) =>
    set((state) => {
      // Skip if already marked in this session
      if (state.markedStudents.has(c.student_id)) return state

      // Upsert: update existing entry for same student instead of duplicating
      const exists = state.pendingConfirmations.find(
        (p) => p.student_id === c.student_id
      )
      if (exists) {
        return {
          pendingConfirmations: state.pendingConfirmations.map((p) =>
            p.student_id === c.student_id
              ? { ...p, confidence: c.confidence, updatedAt: Date.now() }
              : p
          ),
        }
      }
      return {
        pendingConfirmations: [
          ...state.pendingConfirmations,
          { ...c, updatedAt: Date.now() },
        ],
      }
    }),
  removePendingConfirmation: (studentId) =>
    set((state) => ({
      pendingConfirmations: state.pendingConfirmations.filter(
        (c) => c.student_id !== studentId
      ),
    })),

  // Toasts (attendance notifications)
  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: Date.now() }],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}))

export default useAppStore
