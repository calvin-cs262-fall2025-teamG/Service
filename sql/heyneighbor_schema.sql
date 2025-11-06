-- heyneighbor_schema.sql

-- Drop dependent tables first to avoid foreign key constraint errors
DROP TABLE IF EXISTS Messages;
DROP TABLE IF EXISTS Bookmark;
DROP TABLE IF EXISTS Rating;
DROP TABLE IF EXISTS LendingHistory;
DROP TABLE IF EXISTS BorrowingHistory;
DROP TABLE IF EXISTS BorrowingRequest;
DROP TABLE IF EXISTS Item;
DROP TABLE IF EXISTS "User";

CREATE TABLE "User" (
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
    FOREIGN KEY (owner_id) REFERENCES "User"(user_id)
);

CREATE TABLE BorrowingRequest (
    request_id SERIAL PRIMARY KEY,
    borrower_id INT NOT NULL,
    lister_id INT NOT NULL,
    item_id INT NOT NULL,
    request_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending',
    FOREIGN KEY (borrower_id) REFERENCES "User"(user_id),
    FOREIGN KEY (lister_id) REFERENCES "User"(user_id),
    FOREIGN KEY (item_id) REFERENCES Item(item_id)
);

CREATE TABLE BorrowingHistory (
    history_id SERIAL PRIMARY KEY,
    borrower_id INT NOT NULL,
    item_id INT NOT NULL,
    returned BOOLEAN DEFAULT FALSE,
    return_date DATE,
    FOREIGN KEY (borrower_id) REFERENCES "User"(user_id),
    FOREIGN KEY (item_id) REFERENCES Item(item_id)
);

CREATE TABLE LendingHistory (
    history_id SERIAL PRIMARY KEY,
    lender_id INT NOT NULL,
    item_id INT NOT NULL,
    availability_duration INT,
    FOREIGN KEY (lender_id) REFERENCES "User"(user_id),
    FOREIGN KEY (item_id) REFERENCES Item(item_id)
);

CREATE TABLE Rating (
    rating_id SERIAL PRIMARY KEY,
    rater_id INT NOT NULL,
    ratee_id INT NOT NULL,
    score INT CHECK (score BETWEEN 1 AND 5),
    comment TEXT,
    date DATE DEFAULT CURRENT_DATE,
    FOREIGN KEY (rater_id) REFERENCES "User"(user_id),
    FOREIGN KEY (ratee_id) REFERENCES "User"(user_id)
);

CREATE TABLE Bookmark (
    bookmark_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    item_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES "User"(user_id),
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
    FOREIGN KEY (sender_id) REFERENCES "User"(user_id),
    FOREIGN KEY (receiver_id) REFERENCES "User"(user_id),
    FOREIGN KEY (item_id) REFERENCES Item(item_id)
);