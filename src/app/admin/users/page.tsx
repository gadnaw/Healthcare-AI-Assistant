'use client'

import { UserManagement } from '@/components/admin/UserManagement'
import { PermissionGate } from '@/components/rbac/PermissionGate'

export default function UsersPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">User Management</h1>
      
      <PermissionGate permission="USER_MANAGE">
        <UserManagement />
      </PermissionGate>
    </div>
  )
}
