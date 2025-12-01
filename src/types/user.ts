export interface User {
  user_id: number;
  name: string;
  profile_picture: string | null;
}

export interface UserInput {
  name: string;
  profile_picture?: string | null;
}

