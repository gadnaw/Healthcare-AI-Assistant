'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PermissionGate } from '@/components/rbac/PermissionGate'
import { UserList } from '@/components/admin/UserList'
import { UserInviteModal } from '@/components/admin/UserInviteModal'
import { useUserManagement } from '@/hooks/useUserManagement'
import { Role } from '@/lib/rbac/roles'

interface UserManagementProps {
  showInviteButton?: boolean
  showFilters?: boolean
  className?: string
}

export function UserManagement({
  showInviteButton = true,
  showFilters = true,
  className,
}: UserManagementProps) {
  const [showInviteModal, setShowInviteModal] = useState(false)
  const {
    users,
    loading,
    filters,
    setFilters,
    inviteUser,
    assignRole,
    deactivateUser,
    reactivateUser,
    refresh,
  } = useUserManagement()

  const activeCount = users.filter((u) => u.status === 'active').length
  const deactivatedCount = users.filter((u) => u.status === 'deactivated').length

  return (
    <div className={className}>
      <PermissionGate
        permission="USER_MANAGE"
        fallback={
          <Card>
            <CardContent className="py-12 text-center">
              <svg
                className="mx-auto h-12 w-12 text-muted-foreground/50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <h3 className="mt-4 text-lg font-medium">Access Denied</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                You don't have permission to manage users. Contact an administrator if you believe this is an error.
              </p>
            </CardContent>
          </Card>
        }
      >
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>User Management</CardTitle>
                <CardDescription>
                  Manage users and their roles within your organization. All actions are logged for compliance.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refresh()}
                  disabled={loading}
                >
                  <svg
                    className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Refresh
                </Button>

                {showInviteButton && (
                  <PermissionGate permission="USER_INVITE">
                    <Button onClick={() => setShowInviteModal(true)}>
                      <svg
                        className="mr-2 h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                        />
                      </svg>
                      Invite User
                    </Button>
                  </PermissionGate>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {/* Stats Summary */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="rounded-lg bg-muted/50 p-4">
                <div className="text-2xl font-bold">{users.length}</div>
                <div className="text-sm text-muted-foreground">Total Users</div>
              </div>
              <div className="rounded-lg bg-green-50 p-4">
                <div className="text-2xl font-bold text-green-700">{activeCount}</div>
                <div className="text-sm text-green-600">Active</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="text-2xl font-bold text-gray-700">{deactivatedCount}</div>
                <div className="text-sm text-gray-600">Deactivated</div>
              </div>
            </div>

            {/* User List */}
            <UserList
              users={users}
              onAssignRole={assignRole}
              onDeactivate={deactivateUser}
              onReactivate={reactivateUser}
              loading={loading}
              showFilters={showFilters}
            />
          </CardContent>
        </Card>

        {/* Invite Modal */}
        <UserInviteModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          onInvite={() => refresh()}
        />
      </PermissionGate>
    </div>
  )
}

// Compact version for dashboards or sidebars
export function UserManagementCompact({ className }: { className?: string }) {
  return (
    <div className={className}>
      <PermissionGate permission="USER_MANAGE">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">User Management</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                // Could open a sheet or navigate to full management
              }}
            >
              <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              Manage Users
            </Button>
          </CardContent>
        </Card>
      </PermissionGate>
    </div>
  )
}
