/**
 * Type definitions for messages
 */

export interface Message {
  message_id: number;
  sender_id: number;
  receiver_id: number;
  item_id: number | null;
  content: string;
  sent_at: string;
}

export interface MessageInput {
  sender_id: number;
  receiver_id: number;
  item_id?: number | null;
  content: string;
}
