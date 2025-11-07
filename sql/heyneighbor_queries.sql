-- hey neighbor sample queries

-- list all users and their ratings
SELECT user_id, name, rating
FROM UserData
ORDER BY rating DESC;

-- list users who have a perfect 5.0 rating
SELECT name
FROM UserData
WHERE rating = 5.0;

-- show available items with their owners
SELECT i.item_id, i.name AS item_name, u.name AS owner_name -- to prevent confusion between owner_name and item_name
FROM Item i
JOIN UserData u ON i.owner_id = u.user_id
WHERE i.status = 'available'

-- show active borrowing requests
SELECT br.request_id, u1.name AS borrower, u2.name AS lender, i.name AS item, br.status, br.request_datetime
FROM BorrowingRequest br
JOIN UserData u1 ON br.borrower_id = u1.user_id
JOIN UserData u2 ON br.lister_id = u2.user_id
JOIN Item i ON br.item_id = i.item_id
WHERE br.status = 'pending';

-- show borrowing history for a specific user (borrower_id = 2)
SELECT u.name AS borrower, i.name AS item, bh.returned, bh.return_date
FROM BorrowingHistory bh
JOIN UserData u ON bh.borrower_id = u.user_id
JOIN Item i ON bh.item_id = i.item_id
WHERE bh.borrower_id = 2;

-- list lending history
SELECT u.name AS lender, i.name AS item, lh.availability_duration
FROM LendingHistory lh
JOIN UserData u ON lh.lender_id = u.user_id
JOIN Item i ON lh.item_id = i.item_id;
