-- heyneighbor_schema.sql
-- Drop all tables (clean slate)
DROP TABLE IF EXISTS Messages CASCADE;
DROP TABLE IF EXISTS Item CASCADE;
DROP TABLE IF EXISTS app_user CASCADE;

-- Users
CREATE TABLE app_user (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Items
CREATE TABLE Item (
    item_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    image_url VARCHAR(500),
    category VARCHAR(50),
    owner_id INT NOT NULL,
    status VARCHAR(20) DEFAULT 'available', -- 'available' or 'borrowed'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES app_user(user_id) ON DELETE CASCADE
);

-- Messages
CREATE TABLE Messages (
    message_id SERIAL PRIMARY KEY,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    item_id INT, -- optional: message about a specific item
    content TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES app_user(user_id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES app_user(user_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES Item(item_id) ON DELETE SET NULL
);

-- Sample Users (with hashed passwords for 'password123')
INSERT INTO app_user (email, name, password_hash) VALUES
('alice@calvin.edu', 'Alice Johnson', '$2b$10$rZ1qH4xqVxKxZvY8YvY8YO8YvY8YvY8YvY8YvY8YvY8YvY8Yv'),
('bob@calvin.edu', 'Bob Smith', '$2b$10$rZ1qH4xqVxKxZvY8YvY8YO8YvY8YvY8YvY8YvY8YvY8YvY8Yv'),
('charlie@calvin.edu', 'Charlie Lee', '$2b$10$rZ1qH4xqVxKxZvY8YvY8YO8YvY8YvY8YvY8YvY8YvY8YvY8Yv');

-- Sample Items
INSERT INTO Item (name, description, image_url, category, owner_id, status) VALUES
('Lawn Mower', 'Hard to start sometimes but works well', 'lawnmower.jpg', 'Tools', 1, 'available'),
('Tent', 'Great for backpacking, enough for 3 people', 'tent.jpg', 'Outdoor', 2, 'available'),
('Drill', 'Works great!', 'drill.jpg', 'Tools', 3, 'borrowed');

-- Sample Messages
INSERT INTO Messages (sender_id, receiver_id, item_id, content) VALUES
(2, 1, 1, 'Hi Alice, can I borrow your lawn mower this weekend?'),
(1, 2, 1, 'Sure Bob, you can pick it up on Saturday.'),
(3, 2, 2, 'Hey Bob, is the tent available for next week?');