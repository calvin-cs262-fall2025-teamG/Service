-- Drop all tables (clean slate)
DROP TABLE IF EXISTS Messages CASCADE;
DROP TABLE IF EXISTS Item CASCADE;
DROP TABLE IF EXISTS app_user CASCADE;

-- Users
CREATE TABLE app_user (
  user_id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(500),
  rating DECIMAL(2,1) DEFAULT 0.0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster email lookups
CREATE INDEX idx_users_email ON app_user(email);

-- Items
CREATE TABLE Item (
    item_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    image_url VARCHAR(255),
    category VARCHAR(50),
    owner_id INT NOT NULL,
    status VARCHAR(20) DEFAULT 'available', -- 'available' or 'borrowed'
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (owner_id) REFERENCES app_user(user_id) ON DELETE CASCADE
);

-- Messages (for chat coordination)
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

-- Sample Users
INSERT INTO app_user (email, name, password_hash) VALUES
('alice@calvin.edu', 'Alice Johnson', '$2b$10$dummyhash1'),
('bob@calvin.edu', 'Bob Smith', '$2b$10$dummyhash2'),
('charlie@calvin.edu', 'Charlie Lee', '$2b$10$dummyhash3');

-- Sample Items
INSERT INTO Item (name, description, image_url, category, owner_id, status) VALUES
('Lawn Mower', 'Hard to start sometimes but works well', 'lawnmower.jpg', 'Tools', 1, 'available'),
('Tent', 'Great for backpacking, enough for 3 people', 'tent.jpg', 'Outdoor', 2, 'borrowed'),
('Drill', 'Works great!', 'drill.jpg', 'Tools', 3, 'available'),
('USB-C Charger', 'Fast charging cable', 'charger.jpg', 'Electronics', 1, 'available'),
('Camping Stove', 'Portable gas stove', 'stove.jpg', 'Outdoor', 2, 'available');

-- Sample Messages
INSERT INTO Messages (sender_id, receiver_id, item_id, content, sent_at) VALUES
(2, 1, 1, 'Hi Alice, can I borrow your lawn mower this weekend?', '2025-11-20 10:05:00'),
(1, 2, 1, 'Sure Bob, you can pick it up on Saturday.', '2025-11-20 10:10:00'),
(3, 2, 2, 'Hey Bob, is the tent available for next week?', '2025-11-21 14:35:00'),
(2, 3, 2, 'Sorry Charlie, it''s currently borrowed. I''ll message you when it''s back!', '2025-11-21 15:00:00');