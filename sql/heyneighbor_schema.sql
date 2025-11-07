-- heyneighbor_schema.sql

-- Drop dependent tables first to avoid foreign key constraint errors
DROP TABLE IF EXISTS Messages;
DROP TABLE IF EXISTS Bookmark;
DROP TABLE IF EXISTS Rating;
DROP TABLE IF EXISTS LendingHistory;
DROP TABLE IF EXISTS BorrowingHistory;
DROP TABLE IF EXISTS BorrowingRequest;
DROP TABLE IF EXISTS Item;
DROP TABLE IF EXISTS User;

CREATE TABLE User (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    profile_picture VARCHAR(255),
    rating DECIMAL(2,1) DEFAULT 0.0
);

CREATE TABLE Item (
    item_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    image_url VARCHAR(255),
    category VARCHAR(50),
    status VARCHAR(20) DEFAULT 'available',
    owner_id INT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES User(user_id)
);

CREATE TABLE BorrowingRequest (
    request_id SERIAL PRIMARY KEY,
    borrower_id INT NOT NULL,
    lister_id INT NOT NULL,
    item_id INT NOT NULL,
    request_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending',
    FOREIGN KEY (borrower_id) REFERENCES User(user_id),
    FOREIGN KEY (lister_id) REFERENCES User(user_id),
    FOREIGN KEY (item_id) REFERENCES Item(item_id)
);

CREATE TABLE BorrowingHistory (
    history_id SERIAL PRIMARY KEY,
    borrower_id INT NOT NULL,
    item_id INT NOT NULL,
    returned BOOLEAN DEFAULT FALSE,
    return_date DATE,
    FOREIGN KEY (borrower_id) REFERENCES User(user_id),
    FOREIGN KEY (item_id) REFERENCES Item(item_id)
);

CREATE TABLE LendingHistory (
    history_id SERIAL PRIMARY KEY,
    lender_id INT NOT NULL,
    item_id INT NOT NULL,
    availability_duration INT,
    FOREIGN KEY (lender_id) REFERENCES User(user_id),
    FOREIGN KEY (item_id) REFERENCES Item(item_id)
);

CREATE TABLE Rating (
    rating_id SERIAL PRIMARY KEY,
    rater_id INT NOT NULL,
    ratee_id INT NOT NULL,
    score INT CHECK (score BETWEEN 1 AND 5),
    date DATE DEFAULT CURRENT_DATE,
    FOREIGN KEY (rater_id) REFERENCES User(user_id),
    FOREIGN KEY (ratee_id) REFERENCES User(user_id)
);

CREATE TABLE Bookmark (
    bookmark_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    item_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES User(user_id),
    FOREIGN KEY (item_id) REFERENCES Item(item_id),
    UNIQUE (user_id, item_id)
);

CREATE TABLE Messages (
    message_id SERIAL PRIMARY KEY,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    item_id INT,
    content TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES User(user_id),
    FOREIGN KEY (receiver_id) REFERENCES User(user_id),
    FOREIGN KEY (item_id) REFERENCES Item(item_id)
);

-- Allow users to select data from tables
GRANT SELECT ON User TO PUBLIC;
GRANT SELECT ON Item TO PUBLIC;
GRANT SELECT ON BorrowingRequest TO PUBLIC;
GRANT SELECT ON BorrowingHistory TO PUBLIC;
GRANT SELECT ON LendingHistory TO PUBLIC;
GRANT SELECT ON Rating TO PUBLIC;
GRANT SELECT ON Bookmark TO PUBLIC;
GRANT SELECT ON Messages TO PUBLIC;

-- Add sample records

-- Users
INSERT INTO User (name, profile_picture, rating) VALUES
('Alice Johnson', 'alice.jpg', 4.8),
('Bob Smith', 'bob.jpg', 4.5),
('Charlie Kim', 'charlie.png', 4.2),
('Dana Lee', 'dana.png', 5.0);

-- Items
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
INSERT INTO BorrowingHistory (borrower_id, item_id, returned, return_date) VALUES
(2, 1, TRUE, '2025-03-10'),
(3, 2, FALSE, NULL);

-- Lending History
INSERT INTO LendingHistory (lender_id, item_id, availability_duration) VALUES
(1, 1, 7),
(2, 2, 10),
(3, 4, 5);

-- Ratings
INSERT INTO Rating (rater_id, ratee_id, score, date) VALUES
(2, 1, 5, '2025-03-12'),
(3, 2, 4, '2025-04-05'),
(4, 3, 5, '2025-04-20');

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


