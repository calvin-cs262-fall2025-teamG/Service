-- hey neighbor sample queries

-- list all users and their ratings
SELECT user_id, name, rating
FROM "User"
ORDER BY rating DESC;

-- list users who have a perfect 5.0 rating
SELECT name
FROM "User"
WHERE rating = 5.0;

-- show available items with their owners
SELECT i.item_id, i.name AS item_name, u.name AS owner_name -- to prevent confusion between owner_name and item_name
FROM Item i
JOIN "User" u ON i.owner_id = u.user_id
WHERE i.status = 'available'




