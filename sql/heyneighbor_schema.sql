-- heyneighbor_schema.sql
-- Drop all tables (clean slate)
DROP TABLE IF EXISTS organization_member CASCADE;
DROP TABLE IF EXISTS organization_admin CASCADE;
DROP TABLE IF EXISTS organization CASCADE;
DROP TABLE IF EXISTS borrowinghistory CASCADE;
DROP TABLE IF EXISTS borrowingrequest CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS item CASCADE;
DROP TABLE IF EXISTS app_user CASCADE;

-- Users
CREATE TABLE app_user (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    user_name VARCHAR(100) NOT NULL,
    profile_picture VARCHAR(500),
    verification_token VARCHAR(10),
    is_verified BOOLEAN DEFAULT false,
    token_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Items
CREATE TABLE item (
    item_id SERIAL PRIMARY KEY,
    item_name VARCHAR(100) NOT NULL,
    item_description TEXT,
    image_url VARCHAR(500),
    -- category VARCHAR(50), -- What are we doing with these?
    owner_id INT NOT NULL,
    request_status VARCHAR(20) DEFAULT 'available' NOT NULL, -- 'available', 'borrowed', 'pending'
    return_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES app_user(user_id) ON DELETE CASCADE
);

-- Borrowing requests
CREATE TABLE borrowingrequest (
    request_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    item_id INT NOT NULL,
    request_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES app_user(user_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES item(item_id) ON DELETE CASCADE
);

-- Borrowing history (referenced by deleteItem's cascade, no INSERT route yet)
CREATE TABLE borrowinghistory (
    history_id SERIAL PRIMARY KEY,
    request_id INT NOT NULL,
    returned_at TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES borrowingrequest(request_id) ON DELETE CASCADE
);

-- Messages
CREATE TABLE messages (
    message_id SERIAL PRIMARY KEY,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    item_id INT, -- optional: message about a specific item
    message_content TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES app_user(user_id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES app_user(user_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES item(item_id) ON DELETE SET NULL
);

-- Organizations
CREATE TABLE organization (
    organization_id SERIAL PRIMARY KEY,
    organization_name VARCHAR(100) NOT NULL,
    owner_id INT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES app_user(user_id) ON DELETE CASCADE
)

CREATE TABLE organization_admin (
    organization_id INT NOT NULL,
    user_id INT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organization(organization_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
)

CREATE TABLE organization_member (
    organization_id INT NOT NULL,
    user_id INT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organization(organization_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE    
)

-- Sample Users
INSERT INTO app_user (email, name, is_verified, rating) VALUES
('alice@calvin.edu', 'Alice Johnson', true, 4.8),
('bob@calvin.edu', 'Bob Smith', true, 4.5),
('charlie@calvin.edu', 'Charlie Lee', true, 5.0);

-- Sample Items
INSERT INTO item (name, description, image_url, category, owner_id, request_status) VALUES
('Lawn Mower', 'Hard to start sometimes but works well', 'tools.jpg', 'Tools', 1, 'available'),
('Tent', 'Great for backpacking, enough for 3 people', 'campingtent.jpg', 'Outdoor', 2, 'available'),
('Drill', 'Works great!', 'drill.jpg', 'Tools', 3, 'borrowed');

-- Sample Messages
INSERT INTO messages (sender_id, receiver_id, item_id, content) VALUES
(2, 1, 1, 'Hi Alice, can I borrow your lawn mower this weekend?'),
(1, 2, 1, 'Sure Bob, you can pick it up on Saturday.'),
(3, 2, 2, 'Hey Bob, is the tent available for next week?');