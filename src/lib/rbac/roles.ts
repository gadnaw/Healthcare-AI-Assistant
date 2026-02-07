// ============================================
// Role Definitions
// ============================================

export enum Role {
  ADMIN = 'ADMIN',
  PROVIDER = 'PROVIDER',
  STAFF = 'STAFF'
}

// Role hierarchy: higher index = more permissions
export const ROLE_HIERARCHY: Role[] = [Role.STAFF, Role.PROVIDER, Role.ADMIN];

// Role descriptions for UI display
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  [Role.ADMIN]: 'Full system access including user management, audit logs, and organization settings',
  [Role.PROVIDER]: 'Can upload documents, view all content, and provide feedback on AI responses',
  [Role.STAFF]: 'Basic access to view documents and use the chat interface'
};

// Role display names for UI
export const ROLE_DISPLAY_NAMES: Record<Role, string> = {
  [Role.ADMIN]: 'Administrator',
  [Role.PROVIDER]: 'Healthcare Provider',
  [Role.STAFF]: 'Staff Member'
};

/**
 * Check if a role is at or above a required level in the hierarchy
 */
export function isRoleOrHigher(userRole: Role, requiredRole: Role): boolean {
  const userRoleIndex = ROLE_HIERARCHY.indexOf(userRole);
  const requiredRoleIndex = ROLE_HIERARCHY.indexOf(requiredRole);
  
  return userRoleIndex >= requiredRoleIndex;
}

/**
 * Get the next higher role in the hierarchy
 */
export function getNextHigherRole(currentRole: Role): Role | null {
  const currentIndex = ROLE_HIERARCHY.indexOf(currentRole);
  if (currentIndex < ROLE_HIERARCHY.length - 1) {
    return ROLE_HIERARCHY[currentIndex + 1];
  }
  return null;
}

/**
 * Check if role is valid
 */
export function isValidRole(role: string): role is Role {
  return Object.values(Role).includes(role as Role);
}
