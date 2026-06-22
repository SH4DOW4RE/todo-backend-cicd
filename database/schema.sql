CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY users_username_unique (username),
  UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS folders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  author BIGINT UNSIGNED NOT NULL,
  parent_id BIGINT UNSIGNED NULL,
  name VARCHAR(255) NOT NULL,
  `date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY folders_author_idx (author),
  KEY folders_parent_idx (parent_id),
  CONSTRAINT folders_author_fk FOREIGN KEY (author) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT folders_parent_fk FOREIGN KEY (parent_id) REFERENCES folders (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS todos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  author BIGINT UNSIGNED NOT NULL,
  folder_id BIGINT UNSIGNED NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('pending', 'in_progress', 'completed', 'blocked') NOT NULL DEFAULT 'pending',
  `date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY todos_author_idx (author),
  KEY todos_folder_idx (folder_id),
  KEY todos_status_idx (status),
  KEY todos_date_idx (`date`),
  CONSTRAINT todos_author_fk FOREIGN KEY (author) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT todos_folder_fk FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Upgrade an existing database without dropping todo data.
SET @has_creation_date = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todos' AND COLUMN_NAME = 'creation_date'
);
SET @sql = IF(@has_creation_date > 0,
  'ALTER TABLE todos RENAME COLUMN creation_date TO `date`',
  'SELECT 1'
);
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;
ALTER TABLE todos MODIFY `date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

SET @has_folder_id = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todos' AND COLUMN_NAME = 'folder_id'
);
SET @sql = IF(@has_folder_id = 0,
  'ALTER TABLE todos ADD COLUMN folder_id BIGINT UNSIGNED NULL AFTER author',
  'SELECT 1'
);
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @has_folder_index = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todos' AND INDEX_NAME = 'todos_folder_idx'
);
SET @sql = IF(@has_folder_index = 0,
  'ALTER TABLE todos ADD KEY todos_folder_idx (folder_id)',
  'SELECT 1'
);
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @has_folder_fk = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'todos' AND CONSTRAINT_NAME = 'todos_folder_fk'
);
SET @sql = IF(@has_folder_fk = 0,
  'ALTER TABLE todos ADD CONSTRAINT todos_folder_fk FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

-- Upgrade databases created with the original human-readable status values.
ALTER TABLE todos MODIFY status ENUM(
  'to do', 'currently doing', 'done', 'can''t do',
  'pending', 'in_progress', 'completed', 'blocked'
) NOT NULL DEFAULT 'pending';
UPDATE todos SET status = 'pending' WHERE status = 'to do';
UPDATE todos SET status = 'in_progress' WHERE status = 'currently doing';
UPDATE todos SET status = 'completed' WHERE status = 'done';
UPDATE todos SET status = 'blocked' WHERE status = 'can''t do';
ALTER TABLE todos MODIFY status ENUM('pending', 'in_progress', 'completed', 'blocked') NOT NULL DEFAULT 'pending';

-- A todo can have zero or more parents. The composite keys prevent duplicate links.
CREATE TABLE IF NOT EXISTS todo_parents (
  todo_id BIGINT UNSIGNED NOT NULL,
  parent_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (todo_id, parent_id),
  KEY todo_parents_parent_idx (parent_id),
  CONSTRAINT todo_parents_todo_fk FOREIGN KEY (todo_id) REFERENCES todos (id) ON DELETE CASCADE,
  CONSTRAINT todo_parents_parent_fk FOREIGN KEY (parent_id) REFERENCES todos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tags are normalized and use a case-insensitive collation, so "Work" and "work" are one tag.
CREATE TABLE IF NOT EXISTS tags (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY tags_name_unique (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS todo_tags (
  todo_id BIGINT UNSIGNED NOT NULL,
  tag_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (todo_id, tag_id),
  KEY todo_tags_tag_idx (tag_id),
  CONSTRAINT todo_tags_todo_fk FOREIGN KEY (todo_id) REFERENCES todos (id) ON DELETE CASCADE,
  CONSTRAINT todo_tags_tag_fk FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
