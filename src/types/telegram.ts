export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
  allowedUsers: string[]; // Telegram usernames allowed to interact
}

export interface TelegramMessage {
  id: string;
  from: string;
  text: string;
  timestamp: number;
}

export interface TelegramCommand {
  command: string;
  description: string;
  handler: string;
}
