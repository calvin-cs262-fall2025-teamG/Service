export interface User {
  user_id: number;
  name: string;
  profile_picture: string | null;
  email?: string | null;
  rating?: number;
  created_at?: string;
}

export interface UserInput {
  name: string;
  profile_picture?: string | null;
  email?: string | null;
}