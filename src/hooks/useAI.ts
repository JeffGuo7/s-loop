import { useState, useRef, useCallback } from 'react';
import { useAppStore } from '../stores';
import { createProvider, type ChatMessage, type AIProvider } from '../utils/ai';

export function useAI() {
  const { activeProvider, providerConfigs, activeSessionId, addMessage } = useAppStore();
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const providerRef = useRef<AIProvider | null>(null);

  const sendMessage = useCallback(
    async (content: string, conversationHistory: ChatMessage[]) => {
      const config = providerConfigs[activeProvider];

      if (!config.apiKey) {
        setError('Please configure your API key in Settings');
        return;
      }

      setError(null);
      setIsStreaming(true);
      setStreamingContent('');

      const messages: ChatMessage[] = [
        ...conversationHistory,
        { role: 'user', content },
      ];

      providerRef.current = createProvider(activeProvider, {
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
      });

      let fullContent = '';

      try {
        await providerRef.current.chat(messages, {
          onToken: (token) => {
            fullContent += token;
            setStreamingContent(fullContent);
          },
          onComplete: () => {
            if (activeSessionId && fullContent) {
              addMessage(activeSessionId, {
                id: Math.random().toString(36).substring(2, 15),
                role: 'assistant',
                content: fullContent,
                timestamp: Date.now(),
              });
            }
            setIsStreaming(false);
            setStreamingContent('');
          },
          onError: (err) => {
            setError(err.message);
            setIsStreaming(false);
            setStreamingContent('');
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setIsStreaming(false);
        setStreamingContent('');
      }
    },
    [activeProvider, providerConfigs, activeSessionId, addMessage]
  );

  const abort = useCallback(() => {
    providerRef.current?.abort();
    setIsStreaming(false);
    setStreamingContent('');
  }, []);

  return {
    sendMessage,
    abort,
    isStreaming,
    streamingContent,
    error,
  };
}
