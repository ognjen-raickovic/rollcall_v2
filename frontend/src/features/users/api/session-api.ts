import { ApiError, mockReferences, mockRequest } from '@/lib/mock-db'

import type { User } from '../types'
import { usersApi } from './users-api'

const STORAGE_KEY = 'rollcall.demo-user-id'
let memoryUserId: number | null = null

function readUserId(): number | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored === null) return memoryUserId
    const id = Number(stored)
    if (/^\d+$/.test(stored) && Number.isSafeInteger(id) && mockReferences.userIds.has(id)) return id
    writeUserId(null)
    return null
  } catch {
    return memoryUserId
  }
}

function writeUserId(id: number | null) {
  memoryUserId = id
  try {
    if (id === null) sessionStorage.removeItem(STORAGE_KEY)
    else sessionStorage.setItem(STORAGE_KEY, String(id))
  } catch {
    // Privacy modes may block storage; the demo session still works until reload.
  }
}

export const sessionApi = {
  get: async (): Promise<User | null> => {
    const id = readUserId()
    if (id === null) return mockRequest(() => null)
    try {
      return await usersApi.get(id)
    } catch (error) {
      if (error instanceof ApiError && (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR')) {
        writeUserId(null)
        return null
      }
      throw error
    }
  },
  login: async (userId: number): Promise<User> => {
    const user = await usersApi.get(userId)
    writeUserId(user.id)
    return user
  },
  logout: (): Promise<null> =>
    mockRequest(() => {
      writeUserId(null)
      return null
    }),
}
