export interface User {
  user_id: number;
  name: string;
  email?: string;
  profile_picture?: string;
  verification_token?: string;
  is_verified?: boolean;
  token_expires_at?: Date;       
}

export interface UserInput {
  name: string;
  email?: string;
  profile_picture?: string;
}