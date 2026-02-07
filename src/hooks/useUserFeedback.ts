import { useState, useCallback } from 'react';
import { submitFeedbackAction } from '@/server/actions/feedback/submit-feedback';

export interface Feedback {
  id: string;
  messageId: string;
  helpful: boolean;
  comment?: string;
  createdAt: Date;
}

/**
 * Hook for managing user feedback state
 * 
 * @param messageId - The message ID to submit feedback for
 * @returns Object containing feedback state and submission function
 */
export function useUserFeedback(messageId: string) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Submit feedback for the message
   * 
   * @param helpful - Whether the response was helpful (true) or not (false)
   * @param comment - Optional comment about the response
   * @returns The submitted feedback or throws an error
   */
  const submitFeedback = useCallback(
    async (helpful: boolean, comment?: string): Promise<Feedback | null> => {
      setIsSubmitting(true);
      setError(null);

      try {
        const result = await submitFeedbackAction({
          messageId,
          helpful,
          comment,
        });

        if (result.success && result.feedback) {
          setFeedback({
            id: result.feedback.id,
            messageId: result.feedback.messageId,
            helpful: result.feedback.helpful,
            comment: result.feedback.comment,
            createdAt: new Date(result.feedback.createdAt),
          });
          return feedback;
        }

        return null;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to submit feedback';
        setError(errorMessage);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [messageId]
  );

  /**
   * Clear feedback state and errors
   */
  const dismiss = useCallback(() => {
    setFeedback(null);
    setError(null);
  }, []);

  return {
    feedback,
    isSubmitting,
    error,
    submitFeedback,
    dismiss,
  };
}
