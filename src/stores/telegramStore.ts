import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TelegramConfig, TelegramMessage } from '../types/telegram';

interface TelegramState {
  config: TelegramConfig;
  messages: TelegramMessage[];
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;

  // Actions
  setConfig: (config: Partial<TelegramConfig>) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
}

const DEFAULT_CONFIG: TelegramConfig = {
  enabled: false,
  botToken: '',
  chatId: '',
  allowedUsers: [],
};

export const useTelegramStore = create<TelegramState>()(
  persist(
    (set) => ({
      config: DEFAULT_CONFIG,
      messages: [],
      isConnected: false,
      isConnecting: false,
      error: null,

      setConfig: (updates) => {
        set((state) => ({
          config: { ...state.config, ...updates },
        }));
      },

      connect: async () => {
        set({ isConnecting: true, error: null });

        try {
          // TODO: Implement actual Telegram connection via Tauri backend
          // For now, simulate connection
          await new Promise((resolve) => setTimeout(resolve, 1000));

          set({
            isConnected: true,
            isConnecting: false,
            config: { ...DEFAULT_CONFIG, enabled: true },
          });
        } catch (error) {
          set({
            isConnecting: false,
            error: error instanceof Error ? error.message : 'Connection failed',
          });
        }
      },

      disconnect: () => {
        set({
          isConnected: false,
          config: { ...DEFAULT_CONFIG, enabled: false },
        });
      },

      sendMessage: async (text: string) => {
        // TODO: Implement actual message sending via Tauri backend
        const message: TelegramMessage = {
          id: Math.random().toString(36).substring(2, 15),
          from: 'Snotra',
          text,
          timestamp: Date.now(),
        };

        set((state) => ({
          messages: [...state.messages, message],
        }));
      },

      clearMessages: () => {
        set({ messages: [] });
      },
    }),
    {
      name: 'snotra-telegram-storage',
      partialize: (state) => ({
        config: state.config,
        messages: state.messages.slice(-100), // Keep last 100 messages
      }),
    }
  )
);