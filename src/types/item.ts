export interface Item {
  item_id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  category: string | null;
  owner_id: number;
  request_status: "available" | "borrowed" | "pending";
  start_date: string | null;
  end_date: string | null;
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