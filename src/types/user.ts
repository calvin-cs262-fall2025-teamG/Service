export interface User {
  user_id: number;
  email: string;
  name: string;
  email?: string;
  profile_picture?: string;
  verification_token?: string;
  is_verified?: boolean;
  token_expires_at?: Date;       
}

export interface UserInput {
  email: string;
  name: string;
  email?: string;
  profile_picture?: string;
}
