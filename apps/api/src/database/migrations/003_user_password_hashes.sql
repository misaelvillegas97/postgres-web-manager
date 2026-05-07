-- Migration 003: Store password hashes for DB-backed authentication.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_hash TEXT;

UPDATE users
SET password_hash = 'pbkdf2-sha256$310000$dev-auth-seed-v1$a86JLRoEH3UNTahi8fUaFRFA86V2fhPsYXQ9NTFXFxI'
WHERE email IN ('admin@pgstudio.local', 'dev@pgstudio.local');

UPDATE users
SET password_hash = 'disabled'
WHERE password_hash IS NULL;

ALTER TABLE users
    ALTER COLUMN password_hash SET NOT NULL;
