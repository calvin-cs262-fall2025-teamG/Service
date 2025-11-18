-- Authentication Tables for Hey Neighbor

-- Update existing app_user table to add email column
ALTER TABLE app_user ADD email VARCHAR(255) UNIQUE;

-- Verification codes table
CREATE TABLE VerificationCode (
    code_id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    verified BOOLEAN DEFAULT FALSE
);

-- Indexes for performance
CREATE INDEX idx_verification_code_email ON VerificationCode(email);
CREATE INDEX idx_verification_code_expires ON VerificationCode(expires_at);
CREATE INDEX idx_app_user_email ON app_user(email);

-- Grant permissions
GRANT INSERT, UPDATE, DELETE ON VerificationCode TO PUBLIC;
GRANT SELECT ON VerificationCode TO PUBLIC;

-- Cleanup stored procedure for expired codes (optional but recommended)
CREATE PROCEDURE sp_cleanup_expired_codes
AS
BEGIN
    DELETE FROM VerificationCode 
    WHERE expires_at < CURRENT_TIMESTAMP 
    AND verified = 0
    AND DATEDIFF(HOUR, expires_at, CURRENT_TIMESTAMP) > 24;
END;

-- Schedule this to run daily using Azure SQL Agent or Azure Automation
-- EXEC sp_cleanup_expired_codes;
