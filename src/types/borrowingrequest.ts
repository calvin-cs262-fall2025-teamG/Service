export interface BorrowingRequest {
  request_id: number;
  user_id: number;
  item_id: number;
  request_datetime: string;
}

export interface BorrowingRequestInput {
  user_id: number;
  item_id: number;
}