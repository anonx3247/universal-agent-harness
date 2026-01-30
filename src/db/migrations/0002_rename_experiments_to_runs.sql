-- Rename experiments table to runs
ALTER TABLE experiments RENAME TO runs;

-- Recreate messages table with updated foreign key column name
-- SQLite doesn't support ALTER COLUMN, so we recreate the table
CREATE TABLE messages_new (
  id INTEGER PRIMARY KEY,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  run INTEGER NOT NULL REFERENCES runs(id),
  agent INTEGER NOT NULL,
  position INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  UNIQUE(run, agent, position)
);

-- Copy existing data (experiment column becomes run column)
INSERT INTO messages_new 
SELECT id, created, updated, experiment as run, agent, position, role, content, total_tokens, cost 
FROM messages;

-- Replace old table with new one
DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;
