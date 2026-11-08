CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL);
CREATE TABLE chats(id TEXT PRIMARY KEY, legacy_id TEXT UNIQUE, title TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0,
 current_message_id TEXT, model_id TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
 last_read_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, legacy TEXT NOT NULL DEFAULT '{}',
 FOREIGN KEY(id,current_message_id) REFERENCES messages(chat_id,id) DEFERRABLE INITIALLY DEFERRED);
CREATE TABLE messages(chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE, id TEXT NOT NULL, parent_id TEXT,
 role TEXT NOT NULL CHECK(role IN ('system','user','assistant')), model_id TEXT, parts TEXT NOT NULL, status TEXT,
 created_at INTEGER NOT NULL, provider_output TEXT NOT NULL DEFAULT 'null', legacy TEXT NOT NULL DEFAULT '{}',
 PRIMARY KEY(chat_id,id), FOREIGN KEY(chat_id,parent_id) REFERENCES messages(chat_id,id) DEFERRABLE INITIALLY DEFERRED);
CREATE TABLE files(id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL,
 width INTEGER NOT NULL, height INTEGER NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL, legacy TEXT NOT NULL DEFAULT '{}');
CREATE TABLE message_files(chat_id TEXT NOT NULL, message_id TEXT NOT NULL, ordinal INTEGER NOT NULL, file_id TEXT NOT NULL REFERENCES files(id),
 PRIMARY KEY(chat_id,message_id,ordinal), FOREIGN KEY(chat_id,message_id) REFERENCES messages(chat_id,id) ON DELETE CASCADE);
CREATE TABLE draft_snapshots(device_id TEXT NOT NULL, browser_id TEXT NOT NULL, chat_key TEXT NOT NULL, revision INTEGER NOT NULL,
 model_id TEXT NOT NULL, parts TEXT NOT NULL, saved_at INTEGER NOT NULL, legacy TEXT NOT NULL DEFAULT '{}', PRIMARY KEY(device_id,browser_id,chat_key));
CREATE TABLE draft_files(device_id TEXT NOT NULL,browser_id TEXT NOT NULL,chat_key TEXT NOT NULL,ordinal INTEGER NOT NULL,file_id TEXT NOT NULL REFERENCES files(id),
 PRIMARY KEY(device_id,browser_id,chat_key,ordinal), FOREIGN KEY(device_id,browser_id,chat_key) REFERENCES draft_snapshots(device_id,browser_id,chat_key) ON DELETE CASCADE);
CREATE TABLE provider_connections(provider_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, base_url TEXT NOT NULL, api_type TEXT NOT NULL,
 model_ids TEXT NOT NULL, secret_ref TEXT, deleted INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 0, legacy TEXT NOT NULL DEFAULT '{}');
CREATE TABLE pending_secret_deletes(provider_id TEXT NOT NULL,secret_ref TEXT PRIMARY KEY);
CREATE TABLE prompts(id TEXT PRIMARY KEY,command TEXT NOT NULL UNIQUE,name TEXT NOT NULL,content TEXT NOT NULL,updated_at INTEGER NOT NULL,
 imported INTEGER NOT NULL DEFAULT 0,user_modified INTEGER NOT NULL DEFAULT 0,legacy TEXT NOT NULL DEFAULT '{}');
CREATE TABLE generations(id TEXT PRIMARY KEY,chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,device_id TEXT NOT NULL,request_id TEXT NOT NULL,
 user_message_id TEXT NOT NULL,assistant_message_id TEXT NOT NULL,status TEXT NOT NULL,last_seq INTEGER NOT NULL,parts TEXT NOT NULL,
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,error TEXT,provider_output TEXT NOT NULL DEFAULT 'null', UNIQUE(device_id,request_id));
CREATE UNIQUE INDEX one_active_generation ON generations(chat_id) WHERE status IN ('accepted','requesting','streaming');
CREATE TABLE request_receipts(device_id TEXT NOT NULL,request_id TEXT NOT NULL,command_id TEXT UNIQUE,fingerprint TEXT NOT NULL,
 chat_id TEXT NOT NULL,generation_id TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(device_id,request_id));
CREATE TABLE generation_events(generation_id TEXT NOT NULL REFERENCES generations(id) ON DELETE CASCADE,seq INTEGER NOT NULL,event TEXT NOT NULL,
 PRIMARY KEY(generation_id,seq));
CREATE TABLE migration_runs(id TEXT PRIMARY KEY,source_hash TEXT NOT NULL,stage TEXT NOT NULL,report TEXT NOT NULL);
CREATE TABLE legacy_ids(kind TEXT NOT NULL,source_id TEXT NOT NULL,target_id TEXT NOT NULL,source_hash TEXT NOT NULL,PRIMARY KEY(kind,source_id));
CREATE INDEX chats_updated ON chats(updated_at DESC,id);
CREATE INDEX messages_parent ON messages(chat_id,parent_id);
