'use client'

import React, { useState } from 'react'
import { Role } from '@/lib/rbac/roles'
import { UserListItem, UserFilters } from '@/server/actions/admin/get-users'
import { UserRoleBadge } from '@/components/admin/UserRoleBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface UserListProps {
  users: UserListItem[]
  onAssignRole?: (userId: string, role: Role) => Promise<void>
  onDeactivate?: (userId: string, reason: string) => Promise<void>
  onReactivate?: (userId: string) => Promise<void>
  loading?: boolean
  showFilters?: boolean
}

export function UserList({
  users,
  onAssignRole,
  onDeactivate,
  onReactivate,
  loading = false,
  showFilters = true,
}: UserListProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'deactivated'>('all')
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')
  const [deactivationReason, setDeactivationReason] = useState('')
  const [selectedUser, setSelectedUser] = useState<UserListItem | null>(null)
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // Filter users based on search and filters
  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      !searchTerm ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)

    const matchesStatus =
      statusFilter === 'all' || user.status === statusFilter

    const matchesRole =
      roleFilter === 'all' || user.role === roleFilter

    return matchesSearch && matchesStatus && matchesRole
  })

  const activeCount = users.filter((u) => u.status === 'active').length
  const deactivatedCount = users.filter((u) => u.status === 'deactivated').length

  const handleDeactivateClick = (user: UserListItem) => {
    setSelectedUser(user)
    setDeactivationReason('')
    setShowDeactivateDialog(true)
  }

  const handleDeactivateConfirm = async () => {
    if (!selectedUser || !deactivationReason.trim() || deactivationReason.length < 10) {
      return
    }

    setIsProcessing(true)
    try {
      await onDeactivate?.(selectedUser.id, deactivationReason)
      setShowDeactivateDialog(false)
      setSelectedUser(null)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats Summary */}
      <div className="flex gap-4 text-sm">
        <Badge variant="secondary">
          {activeCount} Active
        </Badge>
        <Badge variant="outline">
          {deactivatedCount} Deactivated
        </Badge>
        <Badge variant="outline">
          {filteredUsers.length} Total
        </Badge>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Input
              placeholder="Search by email or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>

          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Status: {statusFilter === 'all' ? 'All' : statusFilter}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setStatusFilter('all')}>
                  All
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatusFilter('active')}>
                  Active
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatusFilter('deactivated')}>
                  Deactivated
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Role: {roleFilter === 'all' ? 'All' : roleFilter}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setRoleFilter('all')}>
                  All Roles
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRoleFilter('ADMIN')}>
                  Admin
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRoleFilter('PROVIDER')}>
                  Provider
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRoleFilter('STAFF')}>
                  Staff
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* User Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 bg-muted/50 animate-pulse rounded-md"
            />
          ))}
        </div>
      ) : filteredUsers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
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
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <p className="mt-4">No users found</p>
            <p className="text-sm">
              {searchTerm || statusFilter !== 'all' || roleFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Invite users to get started'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-4 font-medium">User</th>
                <th className="text-left p-4 font-medium">Role</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium hidden md:table-cell">Last Login</th>
                <th className="text-right p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-muted/25">
                  <td className="p-4">
                    <div>
                      <div className="font-medium">
                        {user.name || 'Unnamed User'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {user.email}
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <UserRoleBadge role={user.role} size="sm" showIcon={false} />
                  </td>
                  <td className="p-4">
                    <Badge
                      variant={user.status === 'active' ? 'default' : 'secondary'}
                    >
                      {user.status === 'active' ? 'Active' : 'Deactivated'}
                    </Badge>
                  </td>
                  <td className="p-4 text-sm text-muted-foreground hidden md:table-cell">
                    {user.lastLogin
                      ? new Date(user.lastLogin).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      {/* Role Assignment Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm">
                            Edit Role
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => onAssignRole?.(user.id, 'STAFF')}
                            disabled={user.role === 'STAFF'}
                          >
                            Staff
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onAssignRole?.(user.id, 'PROVIDER')}
                            disabled={user.role === 'PROVIDER'}
                          >
                            Provider
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onAssignRole?.(user.id, 'ADMIN')}
                            disabled={user.role === 'ADMIN'}
                          >
                            Admin
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Deactivate/Reactivate Button */}
                      {user.status === 'active' ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeactivateClick(user)}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => onReactivate?.(user.id)}
                        >
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Deactivation Confirmation Dialog */}
      <AlertDialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate User</AlertDialogTitle>
            <AlertDialogDescription>
              This will prevent {selectedUser?.email} from logging in. Their data will be preserved and can be restored by reactivating their account.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            <Textarea
              placeholder="Reason for deactivation (required, minimum 10 characters)..."
              value={deactivationReason}
              onChange={(e) => setDeactivationReason(e.target.value)}
              className="min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground mt-2">
              {deactivationReason.length}/500 characters (minimum 10)
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivateConfirm}
              disabled={deactivationReason.length < 10 || isProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing ? 'Deactivating...' : 'Deactivate User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
