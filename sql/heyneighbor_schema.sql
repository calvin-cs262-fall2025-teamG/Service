-- heyneighbor_schema.sql
-- Drop all tables (clean slate)
DROP TABLE IF EXISTS Messages CASCADE;
DROP TABLE IF EXISTS BorrowingHistory CASCADE;
DROP TABLE IF EXISTS BorrowingRequest CASCADE;
DROP TABLE IF EXISTS Item CASCADE;
DROP TABLE IF EXISTS app_user CASCADE;


-- Users
CREATE TABLE app_user (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    profile_picture VARCHAR(255)
);

-- Items
CREATE TABLE Item (
    item_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    image_url VARCHAR(255),
    category VARCHAR(50),
    owner_id INT NOT NULL,
    request_status VARCHAR(20) DEFAULT 'available', -- borrowed, available, pending
    start_date DATE,
    end_date DATE,
    FOREIGN KEY (owner_id) REFERENCES app_user(user_id)
);

-- Borrowing Requests
CREATE TABLE BorrowingRequest (
    request_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    item_id INT NOT NULL,
    request_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES app_user(user_id),
    FOREIGN KEY (item_id) REFERENCES Item(item_id)
);

-- Borrowing History
CREATE TABLE BorrowingHistory (
    request_id INT PRIMARY KEY,
    return_date DATE,
    FOREIGN KEY (request_id) REFERENCES BorrowingRequest(request_id)
);

-- Messages
CREATE TABLE Messages (
    message_id SERIAL PRIMARY KEY,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    item_id INT, -- optional: message about a specific item
    content TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES app_user(user_id),
    FOREIGN KEY (receiver_id) REFERENCES app_user(user_id),
    FOREIGN KEY (item_id) REFERENCES Item(item_id)
);

-- Users
INSERT INTO app_user (name, profile_picture) VALUES
('Alice Johnson', 'alice.jpg'),
('Bob Smith', 'bob.jpg'),
('Charlie Lee', 'charlie.jpg');

-- Items
INSERT INTO Item (name, image_url, category, owner_id, request_status, start_date, end_date) VALUES
('Lawn Mower', 'lawnmower.jpg', 'Tools', 1, 'available', '2025-11-20', '2025-12-20'),
('Tent', 'tent.jpg', 'Outdoor', 2, 'available', '2025-11-21', '2025-12-10'),
('Drill', 'drill.jpg', 'Tools', 3, 'available', '2025-11-22', '2025-12-15');

-- Borrowing Requests
INSERT INTO BorrowingRequest (user_id, item_id, request_datetime) VALUES
(2, 1, '2025-11-20 10:00:00'), -- Bob requests Alice's lawn mower
(3, 2, '2025-11-21 14:30:00'); -- Charlie requests Bob's tent

-- Borrowing History
INSERT INTO BorrowingHistory (request_id, return_date) VALUES
(1, '2025-12-01'), -- Bob returned the lawn mower
(2, NULL);         -- Charlie has not returned the tent yet

-- Messages
INSERT INTO Messages (sender_id, receiver_id, item_id, content, sent_at) VALUES
(2, 1, 1, 'Hi Alice, can I borrow your lawn mower this weekend?', '2025-11-20 10:05:00'),
(1, 2, 1, 'Sure Bob, you can pick it up on Saturday.', '2025-11-20 10:10:00'),
(3, 2, 2, 'Hey Bob, is the tent available for next week?', '2025-11-21 14:35:00');

-- Bookmark
INSERT INTO Bookmark (user_id, item_id) VALUES
(1, 2),
(2, 3),
(3, 1);

