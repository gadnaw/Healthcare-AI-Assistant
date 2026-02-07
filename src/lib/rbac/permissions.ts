import { Role, ROLE_HIERARCHY } from './roles';

// ============================================
// Permission Definitions
// ============================================

export enum Permission {
  // Document permissions
  DOC_VIEW = 'DOC_VIEW',
  DOC_UPLOAD = 'DOC_UPLOAD',
  DOC_APPROVE = 'DOC_APPROVE',
  DOC_DEPRECATE = 'DOC_DEPRECATE',
  
  // Chat and conversation permissions
  CHAT_ACCESS = 'CHAT_ACCESS',
  HISTORY_VIEW = 'HISTORY_VIEW',
  
  // Feedback permissions
  FEEDBACK_SUBMIT = 'FEEDBACK_SUBMIT',
  FEEDBACK_VIEW = 'FEEDBACK_VIEW',
  
  // User management permissions
  USER_INVITE = 'USER_INVITE',
  USER_MANAGE = 'USER_MANAGE',
  
  // Audit permissions
  AUDIT_VIEW = 'AUDIT_VIEW',
  AUDIT_EXPORT = 'AUDIT_EXPORT',
  
  // System permissions
  SYSTEM_CONFIG = 'SYSTEM_CONFIG',
  EMERGENCY_ACCESS = 'EMERGENCY_ACCESS'
}

// Permission descriptions for UI display
export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  [Permission.DOC_VIEW]: 'View and access documents in the knowledge base',
  [Permission.DOC_UPLOAD]: 'Upload new documents to the knowledge base',
  [Permission.DOC_APPROVE]: 'Approve or reject pending documents',
  [Permission.DOC_DEPRECATE]: 'Mark documents as deprecated',
  [Permission.CHAT_ACCESS]: 'Use the AI chat interface',
  [Permission.HISTORY_VIEW]: 'View conversation history',
  [Permission.FEEDBACK_SUBMIT]: 'Submit feedback on AI responses',
  [Permission.FEEDBACK_VIEW]: 'View feedback dashboard and analytics',
  [Permission.USER_INVITE]: 'Invite new users to the organization',
  [Permission.USER_MANAGE]: 'Manage user roles and deactivate users',
  [Permission.AUDIT_VIEW]: 'View audit logs for the organization',
  [Permission.AUDIT_EXPORT]: 'Export audit logs to CSV',
  [Permission.SYSTEM_CONFIG]: 'Modify organization settings',
  [Permission.EMERGENCY_ACCESS]: 'Request emergency access to patient records'
};

// ============================================
// Role-Permission Mapping
// ============================================

// Base permissions for each role
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.STAFF]: [
    Permission.DOC_VIEW,
    Permission.CHAT_ACCESS,
    Permission.HISTORY_VIEW,
    Permission.FEEDBACK_SUBMIT
  ],
  
  [Role.PROVIDER]: [
    // All STAFF permissions
    Permission.DOC_VIEW,
    Permission.CHAT_ACCESS,
    Permission.HISTORY_VIEW,
    Permission.FEEDBACK_SUBMIT,
    // Additional PROVIDER permissions
    Permission.DOC_UPLOAD,
    Permission.FEEDBACK_VIEW
  ],
  
  [Role.ADMIN]: [
    // All PROVIDER permissions
    Permission.DOC_VIEW,
    Permission.CHAT_ACCESS,
    Permission.HISTORY_VIEW,
    Permission.FEEDBACK_SUBMIT,
    Permission.DOC_UPLOAD,
    Permission.FEEDBACK_VIEW,
    // Additional ADMIN permissions
    Permission.DOC_APPROVE,
    Permission.DOC_DEPRECATE,
    Permission.USER_INVITE,
    Permission.USER_MANAGE,
    Permission.AUDIT_VIEW,
    Permission.AUDIT_EXPORT,
    Permission.SYSTEM_CONFIG,
    Permission.EMERGENCY_ACCESS
  ]
};

/**
 * Get all permissions for a specific role
 */
export function getPermissionsForRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if a role has a specific permission
 */
export function roleHasPermission(role: Role, permission: Permission): boolean {
  const permissions = getPermissionsForRole(role);
  return permissions.includes(permission);
}

/**
 * Check if a role has any of the specified permissions
 */
export function roleHasAnyPermission(
  role: Role, 
  permissions: Permission[]
): boolean {
  const userPermissions = getPermissionsForRole(role);
  return permissions.some(p => userPermissions.includes(p));
}

/**
 * Check if a role has all of the specified permissions
 */
export function roleHasAllPermissions(
  role: Role, 
  permissions: Permission[]
): boolean {
  const userPermissions = getPermissionsForRole(role);
  return permissions.every(p => userPermissions.includes(p));
}

/**
 * Get all available permissions across all roles
 */
export function getAllPermissions(): Permission[] {
  return Object.values(Permission);
}

/**
 * Get permissions that are unique to a specific role (not inherited)
 */
export function getUniquePermissionsForRole(role: Role): Permission[] {
  const rolePermissions = getPermissionsForRole(role);
  const lowerRoles = ROLE_HIERARCHY.slice(0, ROLE_HIERARCHY.indexOf(role));
  
  const lowerPermissions = lowerRoles.flatMap(r => getPermissionsForRole(r));
  
  return rolePermissions.filter(p => !lowerPermissions.includes(p));
}
