'use client'

import { useState, useCallback, useEffect } from 'react'
import { Role } from '@/lib/rbac/roles'
import { getUsers, UserListItem, UserFilters } from '@/server/actions/admin/get-users'
import { inviteUser, InviteUserInput } from '@/server/actions/admin/invite-user'
import { assignRole } from '@/server/actions/admin/assign-role'
import { deactivateUser } from '@/server/actions/admin/deactivate-user'
import { reactivateUser } from '@/server/actions/admin/reactivate-user'

export interface UserManagementState {
  users: UserListItem[]
  loading: boolean
  filters: UserFilters
  error: string | null
}

export interface UserManagementActions {
  users: UserListItem[]
  loading: boolean
  filters: UserFilters
  setFilters: (filters: UserFilters) => void
  refresh: () => Promise<void>
  inviteUser: (input: InviteUserInput) => Promise<void>
  assignRole: (userId: string, role: Role) => Promise<void>
  deactivateUser: (userId: string, reason: string) => Promise<void>
  reactivateUser: (userId: string) => Promise<void>
  clearError: () => void
}

export function useUserManagement(): UserManagementActions {
  const [state, setState] = useState<UserManagementState>({
    users: [],
    loading: false,
    filters: {},
    error: null,
  })

  const fetchUsers = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const users = await getUsers(state.filters)
      setState((prev) => ({ ...prev, users, loading: false }))
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch users',
      }))
    }
  }, [state.filters])

  // Fetch users on mount and when filters change
  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const setFilters = useCallback((filters: UserFilters) => {
    setState((prev) => ({ ...prev, filters }))
  }, [])

  const handleInviteUser = useCallback(async (input: InviteUserInput) => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      await inviteUser(input)
      await fetchUsers()
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to invite user',
      }))
      throw error // Re-throw for UI handling
    }
  }, [fetchUsers])

  const handleAssignRole = useCallback(async (userId: string, role: Role) => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      await assignRole(userId, role)
      await fetchUsers()
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to assign role',
      }))
      throw error // Re-throw for UI handling
    }
  }, [fetchUsers])

  const handleDeactivateUser = useCallback(async (userId: string, reason: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      await deactivateUser(userId, reason)
      await fetchUsers()
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to deactivate user',
      }))
      throw error // Re-throw for UI handling
    }
  }, [fetchUsers])

  const handleReactivateUser = useCallback(async (userId: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      await reactivateUser(userId)
      await fetchUsers()
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to reactivate user',
      }))
      throw error // Re-throw for UI handling
    }
  }, [fetchUsers])

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }))
  }, [])

  return {
    users: state.users,
    loading: state.loading,
    filters: state.filters,
    setFilters,
    refresh: fetchUsers,
    inviteUser: handleInviteUser,
    assignRole: handleAssignRole,
    deactivateUser: handleDeactivateUser,
    reactivateUser: handleReactivateUser,
    clearError,
  }
}
