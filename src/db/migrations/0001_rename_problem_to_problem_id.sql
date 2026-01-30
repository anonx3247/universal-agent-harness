-- Migration: Rename problem column to problem_id
-- SQLite doesn't support column rename directly, so we need to:
-- 1. Add new column
-- 2. Copy data
-- 3. Drop old column (via table recreation)

-- Create new experiments table with problem_id
CREATE TABLE experiments_new (
	`id` integer PRIMARY KEY NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`name` text NOT NULL,
	`problem_id` text NOT NULL,
	`profile` text DEFAULT 'example' NOT NULL,
	`model` text NOT NULL,
	`agent_count` integer DEFAULT 0 NOT NULL
);

-- Copy data (problem field becomes problem_id)
INSERT INTO experiments_new SELECT id, created, updated, name, problem, profile, model, agent_count FROM experiments;

-- Drop old table
DROP TABLE experiments;

-- Rename new table
ALTER TABLE experiments_new RENAME TO experiments;

-- Recreate unique constraint
CREATE UNIQUE INDEX experiments_name_unique ON experiments (`name`);
