-- heyneighbor_schema 

-- Drop dependent tables first
DROP TABLE IF EXISTS Messages;
DROP TABLE IF EXISTS Bookmark;
DROP TABLE IF EXISTS BorrowingHistory;
DROP TABLE IF EXISTS BorrowingRequest;
DROP TABLE IF EXISTS Item;
DROP TABLE IF EXISTS app_user;

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
    status VARCHAR(20) DEFAULT 'available',
    owner_id INT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES app_user(user_id)
);

-- Borrowing Requests
CREATE TABLE BorrowingRequest (
    request_id SERIAL PRIMARY KEY,
    borrower_id INT NOT NULL,
    lister_id INT NOT NULL,
    item_id INT NOT NULL,
    request_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending',
    FOREIGN KEY (borrower_id) REFERENCES app_user(user_id),
    FOREIGN KEY (lister_id) REFERENCES app_user(user_id),
    FOREIGN KEY (item_id) REFERENCES Item(item_id)
);

-- Borrowing History
CREATE TABLE BorrowingHistory (
    request_id INT PRIMARY KEY,
    returned BOOLEAN DEFAULT FALSE,
    return_date DATE,
    FOREIGN KEY (request_id) REFERENCES BorrowingRequest(request_id)
);

-- Bookmarks
CREATE TABLE Bookmark (
    bookmark_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    item_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES app_user(user_id),
    FOREIGN KEY (item_id) REFERENCES Item(item_id),
    UNIQUE (user_id, item_id)
);

-- Messages
CREATE TABLE Messages (
    message_id SERIAL PRIMARY KEY,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    item_id INT,
    content TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES app_user(user_id),
    FOREIGN KEY (receiver_id) REFERENCES app_user(user_id),
    FOREIGN KEY (item_id) REFERENCES Item(item_id)
);

-- Grants
GRANT SELECT ON app_user TO PUBLIC;
GRANT SELECT ON Item TO PUBLIC;
GRANT SELECT ON BorrowingRequest TO PUBLIC;
GRANT SELECT ON BorrowingHistory TO PUBLIC;
GRANT SELECT ON Bookmark TO PUBLIC;
GRANT SELECT ON Messages TO PUBLIC;

-- Sample Users
INSERT INTO app_user (name, profile_picture) VALUES
('Alice Johnson', 'alice.jpg'),
('Bob Smith', 'bob.jpg'),
('Charlie Kim', 'charlie.png'),
('Dana Lee', 'dana.png');

-- Sample Items
INSERT INTO Item (name, image_url, category, status, owner_id) VALUES
('Electric Drill', 'drill.jpg', 'Tools', 'available', 1),
('Picnic Table', 'table.jpg', 'Outdoor', 'borrowed', 2),
('Lawn Mower', 'mower.jpg', 'Garden', 'available', 2),
('Tent', 'tent.jpg', 'Camping', 'available', 3);

-- Borrowing Requests
INSERT INTO BorrowingRequest (borrower_id, lister_id, item_id, status) VALUES
(2, 1, 1, 'approved'),
(3, 2, 2, 'pending'),
(4, 3, 4, 'rejected');

-- Borrowing History
INSERT INTO BorrowingHistory (request_id, returned, return_date) VALUES
(1, TRUE, '2025-03-10'),
(2, FALSE, NULL);

-- Bookmarks
INSERT INTO Bookmark (user_id, item_id) VALUES
(1, 2),
(2, 4),
(3, 1);

-- Messages
INSERT INTO Messages (sender_id, receiver_id, item_id, content) VALUES
(2, 1, 1, 'Hi Alice, is the drill still available?'),
(1, 2, 1, 'Yes, you can borrow it anytime this week!'),
(3, 2, 2, 'Hey Bob, could I borrow the picnic table this weekend?');
