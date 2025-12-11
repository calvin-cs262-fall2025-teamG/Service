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
  owner_name?: string;
  owner_email?: string;
  owner_avatar?: string | null;
}

export interface ItemInput {
  name: string;
  description?: string | null;
  image_url?: string | null;
  category?: string | null;
  owner_id: number;
  status?: "available" | "borrowed"; 
}