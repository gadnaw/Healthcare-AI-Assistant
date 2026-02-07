'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { submitFeedbackAction, SubmitFeedbackInput } from '@/server/actions/feedback/submit-feedback';
import { useUserFeedback } from '@/hooks/useUserFeedback';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface Feedback {
  id: string;
  messageId: string;
  helpful: boolean;
  comment?: string;
  createdAt: Date;
}

interface UserFeedbackProps {
  /**
   * The message ID this feedback is associated with
   */
  messageId: string;

  /**
   * Callback fired after successful feedback submission
   */
  onFeedbackSubmit?: (feedback: Feedback) => void;

  /**
   * Callback fired when feedback component is dismissed
   */
  onDismiss?: () => void;

  /**
   * Delay in milliseconds before showing feedback UI (default: 2000ms)
   */
  showDelay?: number;

  /**
   * Custom class name for styling
   */
  className?: string;
}

// ============================================================================
// Basic UI Components (inline to avoid missing dependencies)
// ============================================================================

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'outline' | 'ghost' | 'default';
  size?: 'sm' | 'md';
}

function Button({
  variant = 'default',
  size = 'md',
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  
  const variants = {
    default: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    outline: 'border border-gray-300 bg-white hover:bg-gray-50 focus:ring-gray-500',
    ghost: 'hover:bg-gray-100 focus:ring-gray-500',
  };

  const sizes = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 py-2',
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  maxLength?: number;
}

function Textarea({ className, maxLength, value, onChange, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50',
        className
      )}
      maxLength={maxLength}
      value={value}
      onChange={onChange}
      {...props}
    />
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function UserFeedback({
  messageId,
  onFeedbackSubmit,
  onDismiss,
  showDelay = 2000,
  className,
}: UserFeedbackProps) {
  const {
    feedback,
    isSubmitting,
    error,
    submitFeedback,
    dismiss,
  } = useUserFeedback(messageId);

  const [selectedFeedback, setSelectedFeedback] = useState<'helpful' | 'unhelpful' | null>(null);
  const [comment, setComment] = useState('');
  const [showCommentField, setShowCommentField] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Auto-show feedback component after delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, showDelay);

    return () => clearTimeout(timer);
  }, [showDelay]);

  // Check if user has already submitted feedback for this message
  useEffect(() => {
    if (feedback) {
      setSelectedFeedback(feedback.helpful ? 'helpful' : 'unhelpful');
    }
  }, [feedback]);

  // Handle feedback selection
  const handleFeedbackSelect = useCallback((type: 'helpful' | 'unhelpful') => {
    setSelectedFeedback(type);
    setShowCommentField(true);
  }, []);

  // Handle comment submission
  const handleSubmit = useCallback(async () => {
    if (!selectedFeedback) return;

    try {
      const result = await submitFeedback(
        selectedFeedback === 'helpful',
        comment.trim() || undefined
      );

      if (result) {
        setShowCommentField(false);
        if (onFeedbackSubmit) {
          onFeedbackSubmit(result);
        }
      }
    } catch (err) {
      // Error is handled by the hook
      console.error('Failed to submit feedback:', err);
    }
  }, [selectedFeedback, comment, submitFeedback, onFeedbackSubmit]);

  // Handle skip (submit without comment)
  const handleSkip = useCallback(async () => {
    if (!selectedFeedback) return;

    try {
      const result = await submitFeedback(
        selectedFeedback === 'helpful'
      );

      if (result) {
        setShowCommentField(false);
        if (onFeedbackSubmit) {
          onFeedbackSubmit(result);
        }
      }
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    }
  }, [selectedFeedback, submitFeedback, onFeedbackSubmit]);

  // Handle dismiss
  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    // Save dismiss preference to localStorage
    localStorage.setItem('feedback_dismissed', 'true');
    if (onDismiss) {
      onDismiss();
    }
  }, [onDismiss]);

  // Don't render if not visible yet
  if (!isVisible) {
    return null;
  }

  // If feedback already submitted, show thank you message
  if (feedback && !showCommentField) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700',
          className
        )}
        role="status"
        aria-live="polite"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
        <span>Thank you for your feedback!</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="ml-auto text-green-600 hover:text-green-700"
          aria-label="Dismiss feedback message"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg',
        className
      )}
      role="region"
      aria-label="User feedback"
    >
      {/* Header with dismiss button */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          Was this response helpful?
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Dismiss feedback UI"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </Button>
      </div>

      {/* Feedback selection buttons */}
      {!showCommentField && (
        <div className="flex items-center gap-2" role="group" aria-label="Feedback options">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleFeedbackSelect('helpful')}
            className={cn(
              'flex-1 gap-2 transition-all duration-200',
              selectedFeedback === 'helpful'
                ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                : 'hover:bg-gray-100'
            )}
            aria-pressed={selectedFeedback === 'helpful'}
            disabled={isSubmitting}
          >
            <svg
              className={cn(
                'w-4 h-4',
                selectedFeedback === 'helpful' ? 'text-green-600' : 'text-gray-500'
              )}
              fill={selectedFeedback === 'helpful' ? 'currentColor' : 'none'}
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
              />
            </svg>
            <span className={selectedFeedback === 'helpful' ? 'font-medium' : ''}>
              Helpful
            </span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleFeedbackSelect('unhelpful')}
            className={cn(
              'flex-1 gap-2 transition-all duration-200',
              selectedFeedback === 'unhelpful'
                ? 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100'
                : 'hover:bg-gray-100'
            )}
            aria-pressed={selectedFeedback === 'unhelpful'}
            disabled={isSubmitting}
          >
            <svg
              className={cn(
                'w-4 h-4',
                selectedFeedback === 'unhelpful' ? 'text-red-600' : 'text-gray-500'
              )}
              fill={selectedFeedback === 'unhelpful' ? 'currentColor' : 'none'}
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
              />
            </svg>
            <span className={selectedFeedback === 'unhelpful' ? 'font-medium' : ''}>
              Not helpful
            </span>
          </Button>
        </div>
      )}

      {/* Comment field */}
      {showCommentField && (
        <div className="flex flex-col gap-2" role="group" aria-label="Add comment">
          <Textarea
            placeholder="Any additional comments? (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            className="min-h-[80px] text-sm resize-none"
            aria-label="Feedback comment"
            disabled={isSubmitting}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {comment.length}/500 characters
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                disabled={isSubmitting}
                className="text-gray-500 hover:text-gray-700"
              >
                Skip
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={isSubmitting || !selectedFeedback}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                {isSubmitting ? (
                  <>
                    <svg
                      className="w-4 h-4 mr-1 animate-spin"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Submitting...
                  </>
                ) : (
                  'Submit'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div
          className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600"
          role="alert"
        >
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dismiss()}
            className="ml-auto text-red-600 hover:text-red-700"
            aria-label="Dismiss error"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </Button>
        </div>
      )}
    </div>
  );
}
