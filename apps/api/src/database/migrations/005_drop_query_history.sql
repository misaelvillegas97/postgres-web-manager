-- Migration 005: Browser-only query history
-- Query history is now encrypted and stored locally in the browser.

DROP TABLE IF EXISTS query_history;
