-- hey neighbor sample queries

-- list all users 
SELECT user_id, name, profile_picture
FROM app_user;

-- show available items with their owners
SELECT i.item_id, i.name AS item_name, i.category, u.name AS owner_name
FROM Item i
JOIN app_user u ON i.owner_id = u.user_id
WHERE i.request_status = 'available';

-- show active borrowing requests
-- (Active = requests for items not yet returned; you can assume return_date IS NULL or `request_status = 'pending')
SELECT r.request_id, u.name AS requester_name, i.name AS item_name, r.request_datetime
FROM BorrowingRequest r
JOIN app_user u ON r.user_id = u.user_id
JOIN Item i ON r.item_id = i.item_id
WHERE i.request_status = 'pending';

-- show borrowing history for a specific user (borrower_id = 2)
SELECT i.name AS item_name, r.request_datetime, b.return_date
FROM BorrowingHistory b
JOIN BorrowingRequest r ON b.request_id = r.request_id
JOIN Item i ON r.item_id = i.item_id
WHERE r.user_id = 2;  -- Replace 2 with the specific user_id










