'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

interface SessionTimeoutMonitorProps {
  /**
   * Total session timeout duration in minutes
   * Default: 15 minutes (HIPAA compliance requirement)
   */
  timeoutMinutes?: number;
  
  /**
   * Warning dialog trigger time in minutes before timeout
   * Default: 13 minutes (2-minute warning window)
   */
  warningMinutes?: number;
  
  /**
   * Callback fired when session times out
   * Default: Logs out user and redirects to login
   */
  onTimeout?: () => void;
  
  /**
   * Custom activity events to track
   * Default: ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove']
   */
  activityEvents?: string[];
}

interface SessionState {
  isActive: boolean;
  remainingSeconds: number;
  warningVisible: boolean;
  showModal: boolean;
}

/**
 * SessionTimeoutMonitor Component
 * 
 * Tracks user activity and enforces session timeout for HIPAA compliance.
 * Shows warning dialog at configurable time before timeout.
 * Automatically logs out user when inactivity threshold is exceeded.
 * 
 * HIPAA Compliance:
 * - §164.312(a)(2)(iii) Automatic Logoff
 * - Tracks user activity events to detect inactivity
 * - 15-minute inactivity timeout (configurable)
 * 
 * Features:
 * - Configurable timeout and warning durations
 * - Real-time countdown timer
 * - "Extend Session" option to prevent forced logout
 * - Graceful handling of session expiration
 * - Support for custom activity event detection
 * 
 * @example
 * <SessionTimeoutMonitor 
 *   timeoutMinutes={15}
 *   warningMinutes={13}
 *   onTimeout={() => handleLogout()}
 * />
 */
export function SessionTimeoutMonitor({
  timeoutMinutes = 15,
  warningMinutes = 13,
  onTimeout,
  activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove', 'visibilitychange']
}: SessionTimeoutMonitorProps) {
  const router = useRouter();
  const supabase = createClient();
  
  const [sessionState, setSessionState] = useState<SessionState>({
    isActive: true,
    remainingSeconds: timeoutMinutes * 60,
    warningVisible: false,
    showModal: false,
  });
  
  const lastActivityRef = useRef<number>(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  
  // Calculate seconds until warning and timeout
  const warningSeconds = warningMinutes * 60;
  const timeoutSeconds = timeoutMinutes * 60;
  const secondsUntilWarning = timeoutSeconds - warningSeconds;
  
  /**
   * Reset session timer on user activity
   */
  const resetSessionTimer = useCallback(() => {
    const now = Date.now();
    const timeSinceLastActivity = (now - lastActivityRef.current) / 1000;
    
    // Only reset if significant activity detected (prevents rapid re-renders)
    if (timeSinceLastActivity > 1) {
      lastActivityRef.current = now;
      
      setSessionState(prev => ({
        ...prev,
        isActive: true,
        remainingSeconds: timeoutSeconds,
        warningVisible: false,
        showModal: false,
      }));
      
      // Clear existing timeouts
      if (warningRef.current) clearTimeout(warningRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      
      // Schedule warning dialog
      if (secondsUntilWarning > 0) {
        warningRef.current = setTimeout(() => {
          setSessionState(prev => ({
            ...prev,
            warningVisible: true,
            showModal: true,
          }));
          
          // Start countdown in warning state
          startCountdown();
        }, secondsUntilWarning * 1000);
      }
      
      // Schedule timeout
      timeoutRef.current = setTimeout(() => {
        handleSessionTimeout();
      }, timeoutSeconds * 1000);
    }
  }, [timeoutSeconds, secondsUntilWarning]);
  
  /**
   * Start countdown timer (used during warning period)
   */
  const startCountdown = useCallback(() => {
    const startTime = Date.now();
    const warningDuration = warningSeconds * 1000;
    
    countdownRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, warningSeconds - elapsed);
      
      setSessionState(prev => ({
        ...prev,
        remainingSeconds: Math.ceil(remaining),
      }));
      
      if (remaining <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
      }
    }, 1000);
  }, [warningSeconds]);
  
  /**
   * Handle session timeout
   */
  const handleSessionTimeout = useCallback(async () => {
    // Clear all timers
    if (warningRef.current) clearTimeout(warningRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    
    try {
      // Sign out from Supabase
      await supabase.auth.signOut();
      
      // Clear any cached session data
      if (typeof window !== 'undefined') {
        sessionStorage.clear();
        localStorage.removeItem('supabase.auth.token');
      }
      
      // Call custom timeout handler if provided
      if (onTimeout) {
        onTimeout();
      } else {
        // Default behavior: redirect to login with reason
        router.push('/login?reason=session_expired');
      }
    } catch (error) {
      console.error('Error during session timeout:', error);
      // Still redirect even if signout fails
      router.push('/login?reason=session_expired');
    }
  }, [supabase, router, onTimeout]);
  
  /**
   * Extend session (user clicks "Stay Logged In")
   */
  const extendSession = useCallback(() => {
    resetSessionTimer();
  }, [resetSessionTimer]);
  
  /**
   * Set up activity event listeners
   */
  useEffect(() => {
    const handleActivity = () => {
      resetSessionTimer();
    };
    
    // Add event listeners for all specified activity events
    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity);
    });
    
    // Cleanup
    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [activityEvents, resetSessionTimer]);
  
  /**
   * Initialize session monitoring on mount
   */
  useEffect(() => {
    // Initialize last activity time
    lastActivityRef.current = Date.now();
    
    // Start the session timeout countdown
    resetSessionTimer();
    
    // Cleanup on unmount
    return () => {
      if (warningRef.current) clearTimeout(warningRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [resetSessionTimer]);
  
  /**
   * Don't render anything in production if session is active
   * Only show during warning period or timeout countdown
   */
  if (!sessionState.showModal) {
    return null;
  }
  
  /**
   * Format seconds as MM:SS
   */
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
        {/* Warning Icon */}
        <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-amber-100 rounded-full">
          <svg 
            className="w-6 h-6 text-amber-600" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
            />
          </svg>
        </div>
        
        {/* Title */}
        <h2 className="text-xl font-semibold text-center text-gray-900 mb-2">
          Session Expiring Soon
        </h2>
        
        {/* Countdown */}
        <div className="text-center mb-6">
          <p className="text-sm text-gray-600 mb-1">
            Your session will expire due to inactivity
          </p>
          <div className="text-4xl font-bold text-amber-600 font-mono">
            {formatTime(sessionState.remainingSeconds)}
          </div>
        </div>
        
        {/* Message */}
        <p className="text-sm text-gray-600 text-center mb-6">
          For your security, you will be automatically logged out after 15 minutes 
          of inactivity. This is required for HIPAA compliance.
        </p>
        
        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSessionTimeout}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 
                     rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 
                     focus:ring-gray-300 transition-colors"
          >
            Log Out Now
          </button>
          
          <button
            onClick={extendSession}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 
                     rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 
                     focus:ring-blue-300 transition-colors"
          >
            Extend Session
          </button>
        </div>
        
        {/* HIPAA Notice */}
        <p className="mt-4 text-xs text-center text-gray-400">
          HIPAA Compliance • Automatic Session Timeout
        </p>
      </div>
    </div>
  );
}

export default SessionTimeoutMonitor;
