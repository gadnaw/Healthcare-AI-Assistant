'use client'

import React from 'react'
import { Role } from '@/lib/rbac/roles'
import { cn } from '@/lib/utils'

interface UserRoleBadgeProps {
  role: Role
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  showIcon?: boolean
  className?: string
}

const roleConfig: Record<Role, { 
  color: string; 
  bgColor: string; 
  borderColor: string;
  label: string;
  icon: React.ReactNode;
}> = {
  ADMIN: {
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    label: 'Admin',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
  },
  PROVIDER: {
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    label: 'Provider',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
  },
  STAFF: {
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    label: 'Staff',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
}

const sizeConfig = {
  sm: {
    badge: 'px-2 py-0.5 text-xs',
    icon: 'w-3 h-3',
    gap: 'gap-1',
  },
  md: {
    badge: 'px-2.5 py-1 text-sm',
    icon: 'w-3.5 h-3.5',
    gap: 'gap-1.5',
  },
  lg: {
    badge: 'px-3 py-1.5 text-base',
    icon: 'w-4 h-4',
    gap: 'gap-2',
  },
}

export function UserRoleBadge({
  role,
  size = 'md',
  showLabel = true,
  showIcon = true,
  className,
}: UserRoleBadgeProps) {
  const config = roleConfig[role]
  const sizes = sizeConfig[size]

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full border',
        config.bgColor,
        config.borderColor,
        config.color,
        sizes.badge,
        className
      )}
    >
      {showIcon && (
        <span className={cn('flex-shrink-0', sizes.icon)}>
          {config.icon}
        </span>
      )}
      {showLabel && (
        <span className={cn('flex-shrink-0', sizes.gap)}>
          {config.label}
        </span>
      )}
    </span>
  )
}

// Compact version without text
export function UserRoleBadgeIcon({ role, size = 'md', className }: Omit<UserRoleBadgeProps, 'showLabel' | 'showIcon'>) {
  const config = roleConfig[role]
  const sizes = sizeConfig[size]

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full border',
        config.bgColor,
        config.borderColor,
        config.color,
        sizes.badge,
        className
      )}
    >
      <span className={cn('flex-shrink-0', sizes.icon)}>
        {config.icon}
      </span>
    </span>
  )
}
