ALTER TABLE messages ADD COLUMN ordinal INTEGER NOT NULL DEFAULT 0;
UPDATE messages SET ordinal=rowid;
CREATE UNIQUE INDEX messages_ordinal ON messages(chat_id,ordinal);
CREATE TABLE product_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
