-- 001_schema.sql — schemat bazy MySQL/MariaDB dla szablonu notatek
-- Uruchom (Remote Access bazy musi być włączony w panelu MonsterASP):
--   node /ścieżka/do/skilla/scripts/db_exec.js --env-file .deploy.env sql/001_schema.sql

CREATE TABLE IF NOT EXISTS items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  done TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dane startowe (opcjonalnie — odkomentuj):
-- INSERT INTO items (name, done) VALUES
--   ('Pierwsza notatka z seeda', 0),
--   ('Druga notatka (wykonana)', 1);
