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