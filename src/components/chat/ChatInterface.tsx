'use client'

import { useState, useRef, useEffect } from 'react'
import { UserFeedback } from '@/components/feedback/UserFeedback'
import { useAuth } from '@/hooks/useAuth'
import { submitChatMessage } from '@/server/actions/chat'
import { useChat } from '@/hooks/useChat'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useToast } from '@/components/ui/use-toast'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export function ChatInterface() {
  const { user } = useAuth()
  const { messages, isLoading, sendMessage, error } = useChat()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // Auto-scroll to bottom when new messages appear
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const message = input
    setInput('')

    try {
      await sendMessage(message)
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to send message. Please try again.',
        variant: 'destructive'
      })
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] max-w-4xl mx-auto">
      {/* Messages Area */}
      <Card className="flex-1 overflow-hidden mb-4">
        <ScrollArea className="h-full p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <Avatar className="w-16 h-16 mb-4">
                  <AvatarImage src="/ai-assistant.png" />
                  <AvatarFallback>AI</AvatarFallback>
                </Avatar>
                <p className="text-lg font-medium">How can I help you today?</p>
                <p className="text-sm">Ask me anything about your documents.</p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <Avatar className="w-8 h-8 mt-1">
                      <AvatarFallback>
                        {message.role === 'user' ? 'U' : 'AI'}
                      </AvatarFallback>
                    </Avatar>
                    <div className={`mx-2 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
                      <Card className={`${message.role === 'user' ? 'bg-primary text-primary-foreground' : ''}`}>
                        <CardContent className="p-3">
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        </CardContent>
                      </Card>
                      
                      {/* UserFeedback after AI responses */}
                      {message.role === 'assistant' && (
                        <div className="mt-2">
                          <UserFeedback
                            messageId={message.id}
                            onFeedbackSubmit={(feedback) => {
                              console.log('Feedback submitted:', feedback)
                              toast({
                                title: 'Feedback received',
                                description: 'Thank you for your feedback!',
                                duration: 2000
                              })
                            }}
                          />
                        </div>
                      )}
                      
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex max-w-[80%] flex-row">
                  <Avatar className="w-8 h-8 mt-1">
                    <AvatarFallback>AI</AvatarFallback>
                  </Avatar>
                  <div className="mx-2">
                    <Card>
                      <CardContent className="p-3">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75" />
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150" />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            )}
            
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
                {error}
              </div>
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Input Area */}
      <Card>
        <CardContent className="p-4">
          <div className="flex space-x-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
              {isLoading ? 'Sending...' : 'Send'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default ChatInterface
