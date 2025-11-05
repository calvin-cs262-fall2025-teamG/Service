-- heyneighbor_schema.sql

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
