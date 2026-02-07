'use client'

import { OrganizationSettings } from '@/components/admin/OrganizationSettings'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PermissionGate } from '@/components/rbac/PermissionGate'

export default function SettingsPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Organization Settings</h1>
      
      <PermissionGate permission="SYSTEM_CONFIG">
        <Tabs defaultValue="general" className="space-y-6">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
          </TabsList>
          
          <TabsContent value="general">
            <OrganizationSettings showSection={['timeout']} />
          </TabsContent>
          
          <TabsContent value="security">
            <OrganizationSettings showSection={['mfa']} />
          </TabsContent>
          
          <TabsContent value="compliance">
            <OrganizationSettings showSection={['password', 'lockout']} />
          </TabsContent>
        </Tabs>
      </PermissionGate>
    </div>
  )
}
