export interface User {
  user_id: number;
  email: string;
  name: string;
  password_hash?: string; // Optional - don't send to client
  avatar_url: string | null;
  created_at: string;
}

export interface UserInput {
  email: string;
  name: string;
  password_hash: string;
  avatar_url?: string | null;
}

