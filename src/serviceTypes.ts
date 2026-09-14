// Borrowing Request
export interface BorrowingRequest {
  request_id: number;
  user_id: number;
  item_id: number;
  request_datetime?: Date;
}

export interface BorrowingRequestInput {
  user_id: number;
  item_id: number;
}

// Item
export interface Item {
  item_id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  category: string | null;
  owner_id: number;
  status: "available" | "borrowed"; 
  created_at: string;
  // Owner info from JOIN queries
  owner_name?: string | null;
  owner_email?: string | null;
  owner_avatar?: string | null;
}

export interface ItemInput {
  name: string;
  description?: string | null;
  image_url?: string | null;
  category?: string | null;
  owner_id: number;
  request_status?: "available" | "borrowed" | "pending";
  start_date?: string | null;
  end_date?: string | null;
}

export interface ItemWithOwner extends Item {
  owner_name: string | null;
  owner_avatar: string | null;
}

// Messages
export interface Message {
  message_id: number;
  sender_id: number;
  receiver_id: number;
  item_id: number | null;
  content: string;
  sent_at: string;
  // Sender/receiver info from JOIN queries
  sender_name?: string;
  sender_avatar?: string | null;
  receiver_name?: string;
}

export interface MessageInput {
  sender_id: number;
  receiver_id: number;
  item_id?: number | null;
  content: string;
}

// User
export interface User {
  user_id: number;
  email: string;
  name: string;
  password_hash?: string | null;
  profile_picture?: string | null;
  verification_token?: string | null;
  is_verified?: boolean | null;
  token_expires_at?: Date | null;       
}

export interface UserInput {
  email: string;
  name: string;
  profile_picture?: string | null;
}
