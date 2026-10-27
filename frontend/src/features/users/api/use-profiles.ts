import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { z } from 'zod'
import { profilesApi } from './profiles-api'
import { useAuth } from './use-auth'
import type { GameExperienceLevel, ProfileUpdate } from '../types'

export function useOwnProfile() {
  const auth = useAuth()
  return useQuery({
    queryKey: ['own-profile', auth.data?.id],
    queryFn: ({ signal }) => profilesApi.getOwn(auth.data?.id ?? '', signal),
    enabled: Boolean(auth.data),
    retry: false,
  })
}

export function usePublicProfile(userId: string) {
  return useQuery({
    queryKey: ['public-profile', userId],
    queryFn: ({ signal }) => profilesApi.getPublic(userId, signal),
    enabled: z.uuid().safeParse(userId).success,
    retry: false,
  })
}

export function useProfileExperience() {
  const auth = useAuth()
  return useQuery({
    queryKey: ['profile-experience', auth.data?.id],
    queryFn: ({ signal }) => profilesApi.experience(auth.data?.id ?? '', signal),
    enabled: Boolean(auth.data),
    retry: false,
  })
}

export function useUpdateProfile() {
  const client = useQueryClient()
  const auth = useAuth()
  const ownerId = auth.data?.id
  return useMutation({
    gcTime: 0,
    mutationFn: async (update: ProfileUpdate) => {
      await client.cancelQueries({ queryKey: ['own-profile', ownerId] })
      return profilesApi.update(update, ownerId ?? '')
    },
    onSuccess: async (profile) => {
      await client.cancelQueries({ queryKey: ['own-profile', ownerId] })
      if (client.getQueryData<{ id: string }>(['auth-account'])?.id !== ownerId) return
      client.setQueryData(['own-profile', ownerId], profile)
      void client.invalidateQueries({ queryKey: ['public-profile', ownerId] })
    },
  })
}

export function useSetProfileExperience() {
  const client = useQueryClient()
  const auth = useAuth()
  const ownerId = auth.data?.id
  return useMutation({
    mutationFn: (value: { gameId: number; experience: GameExperienceLevel }) =>
      profilesApi.setExperience(value, ownerId ?? ''),
    onSuccess: () => {
      if (client.getQueryData<{ id: string }>(['auth-account'])?.id !== ownerId) return
      void client.invalidateQueries({ queryKey: ['own-profile', ownerId] })
      void client.invalidateQueries({ queryKey: ['profile-experience', ownerId] })
      void client.invalidateQueries({ queryKey: ['public-profile', ownerId] })
    },
  })
}

export function useRemoveProfileExperience() {
  const client = useQueryClient()
  const auth = useAuth()
  const ownerId = auth.data?.id
  return useMutation({
    mutationFn: (gameId: number) => profilesApi.removeExperience(gameId, ownerId ?? ''),
    onSuccess: () => {
      if (client.getQueryData<{ id: string }>(['auth-account'])?.id !== ownerId) return
      void client.invalidateQueries({ queryKey: ['own-profile', ownerId] })
      void client.invalidateQueries({ queryKey: ['profile-experience', ownerId] })
      void client.invalidateQueries({ queryKey: ['public-profile', ownerId] })
    },
  })
}

export function useReplaceProfileExperience() {
  const client = useQueryClient()
  const auth = useAuth()
  const ownerId = auth.data?.id ?? ''
  const requests = useRef(new Set<AbortController>())
  useEffect(() => {
    const pending = requests.current
    return () => {
      for (const request of pending) request.abort()
      pending.clear()
    }
  }, [ownerId])
  return useMutation({
    gcTime: 0,
    mutationFn: async (value: Parameters<typeof profilesApi.replaceExperience>[0]) => {
      const controller = new AbortController()
      requests.current.add(controller)
      try {
        return await profilesApi.replaceExperience(value, ownerId, controller.signal)
      } finally {
        requests.current.delete(controller)
      }
    },
    onSuccess: async () => {
      if (client.getQueryData<{ id: string }>(['auth-account'])?.id !== ownerId) return
      await client.cancelQueries({ queryKey: ['own-profile', ownerId] })
      await client.cancelQueries({ queryKey: ['profile-experience', ownerId] })
      if (client.getQueryData<{ id: string }>(['auth-account'])?.id !== ownerId) return
      await Promise.all([
        client.invalidateQueries({ queryKey: ['own-profile', ownerId] }),
        client.invalidateQueries({ queryKey: ['profile-experience', ownerId] }),
        client.invalidateQueries({ queryKey: ['public-profile', ownerId] }),
      ])
    },
  })
}
