import { create } from 'zustand'
import { apiCreateAgentTask, apiGetAgentTasks, apiGetAgentTask, apiCancelAgentTask } from '../../lib/api'

const useAgentStore = create((set, get) => ({
  tasks: [],
  currentTaskId: null,
  streamSteps: [],
  streamStatus: 'idle', // idle | running | done | failed

  createTask: async (payload) => {
    const { task_id } = await apiCreateAgentTask(payload)
    set({ currentTaskId: task_id, streamSteps: [], streamStatus: 'running' })
    return task_id
  },

  fetchTasks: async (orgId) => {
    const tasks = await apiGetAgentTasks(orgId)
    set({ tasks })
  },

  fetchTask: async (taskId) => {
    const task = await apiGetAgentTask(taskId)
    return task
  },

  appendStep: (step) => {
    set(s => ({ streamSteps: [...s.streamSteps, step] }))
  },

  setStreamStatus: (status) => set({ streamStatus: status }),

  cancelTask: async (taskId) => {
    await apiCancelAgentTask(taskId)
    set(s => ({
      tasks: s.tasks.map(t => t.id === taskId ? { ...t, status: 'cancelled' } : t)
    }))
  },

  clearStream: () => set({ streamSteps: [], streamStatus: 'idle', currentTaskId: null }),
}))

export default useAgentStore
