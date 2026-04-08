import { create } from 'zustand'

const safeJSONParse = (str) => {
  if (!str || str === 'undefined') return null;
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
};

export const useAuthStore = create((set) => ({
  user: safeJSONParse(localStorage.getItem('user')),
  token: localStorage.getItem('token') || null,

  login: (token, user) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ token, user })
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ token: null, user: null })
  },
}))

export const useChatStore = create((set, get) => ({
  messages: [],
  documents: [],
  isLoading: false,
  isSidebarOpen: true,
  stepLog: [],
  memorySummary: '',
  setDocuments: (docs) => set({ documents: docs }),
  setMessages: (messages) => set({ messages }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setLoading: (v) => set({ isLoading: v }),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  addStep: (step) => set((s) => ({ stepLog: [...s.stepLog, step] })),
  clearSteps: () => set({ stepLog: [] }),
  setMemorySummary: (summary) => set({ memorySummary: summary }),
}))
