-- Bikers Portal — MySQL 8 schema
-- Run with: npm run db:schema

CREATE DATABASE IF NOT EXISTS bikers_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bikers_portal;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS notifications, reports, reviews, comments, posts, connections,
  trips, ride_participants, ride_stops, rides, users, locations;
SET FOREIGN_KEY_CHECKS = 1;

-- Real, valid places on the Indian map (imported from GeoNames)
CREATE TABLE locations (
  id            INT UNSIGNED PRIMARY KEY,           -- GeoNames id
  name          VARCHAR(160) NOT NULL,
  state         VARCHAR(100) NOT NULL DEFAULT '',
  lat           DECIMAL(9,6) NOT NULL,
  lng           DECIMAL(9,6) NOT NULL,
  kind          ENUM('city','town','village','pass','peak','lake','other') NOT NULL DEFAULT 'town',
  population    INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT chk_locations_in_india CHECK (lat BETWEEN 6 AND 37.5 AND lng BETWEEN 68 AND 97.5),
  INDEX idx_locations_name (name),
  INDEX idx_locations_lat_lng (lat, lng)
) ENGINE=InnoDB;

CREATE TABLE users (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email             VARCHAR(190) NOT NULL UNIQUE,
  password_hash     CHAR(60) NOT NULL,
  display_name      VARCHAR(80) NOT NULL,
  home_location_id  INT UNSIGNED NULL,
  bike_model        VARCHAR(120) NOT NULL DEFAULT '',
  bio               VARCHAR(600) NOT NULL DEFAULT '',
  role              ENUM('rider','admin') NOT NULL DEFAULT 'rider',
  status            ENUM('active','suspended') NOT NULL DEFAULT 'active',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (home_location_id) REFERENCES locations(id)
) ENGINE=InnoDB;

CREATE TABLE rides (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  host_id            INT UNSIGNED NOT NULL,
  title              VARCHAR(140) NOT NULL,
  description        TEXT NOT NULL,
  start_location_id  INT UNSIGNED NOT NULL,
  end_location_id    INT UNSIGNED NOT NULL,
  start_date         DATE NOT NULL,
  end_date           DATE NOT NULL,
  is_tentative       BOOLEAN NOT NULL DEFAULT FALSE,
  capacity           SMALLINT UNSIGNED NOT NULL,
  expense_type       ENUM('shared','host_sponsored') NOT NULL DEFAULT 'shared',
  expense_note       VARCHAR(300) NOT NULL DEFAULT '',
  status             ENUM('draft','published','completed','cancelled') NOT NULL DEFAULT 'published',
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_rides_dates CHECK (end_date >= start_date),
  CONSTRAINT chk_rides_capacity CHECK (capacity BETWEEN 1 AND 200),
  FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (start_location_id) REFERENCES locations(id),
  FOREIGN KEY (end_location_id) REFERENCES locations(id),
  INDEX idx_rides_status_dates (status, start_date)
) ENGINE=InnoDB;

-- Ordered route: stop_order 0 = start, last = destination
CREATE TABLE ride_stops (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_id       INT UNSIGNED NOT NULL,
  location_id   INT UNSIGNED NOT NULL,
  stop_order    SMALLINT UNSIGNED NOT NULL,
  planned_date  DATE NULL,
  UNIQUE KEY uq_ride_stop_order (ride_id, stop_order),
  FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB;

-- Partial-segment participation
CREATE TABLE ride_participants (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_id        INT UNSIGNED NOT NULL,
  user_id        INT UNSIGNED NOT NULL,
  join_stop_id   INT UNSIGNED NOT NULL,
  leave_stop_id  INT UNSIGNED NOT NULL,
  join_date      DATE NOT NULL,
  leave_date     DATE NOT NULL,
  status         ENUM('joined','left','removed') NOT NULL DEFAULT 'joined',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_user (ride_id, user_id),
  CONSTRAINT chk_participant_dates CHECK (leave_date >= join_date),
  FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (join_stop_id) REFERENCES ride_stops(id),
  FOREIGN KEY (leave_stop_id) REFERENCES ride_stops(id)
) ENGINE=InnoDB;

CREATE TABLE trips (
  id                       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id                  INT UNSIGNED NOT NULL,
  origin_location_id       INT UNSIGNED NOT NULL,
  destination_location_id  INT UNSIGNED NOT NULL,
  start_date               DATE NOT NULL,
  end_date                 DATE NOT NULL,
  notes                    VARCHAR(600) NOT NULL DEFAULT '',
  status                   ENUM('active','closed') NOT NULL DEFAULT 'active',
  created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_trips_dates CHECK (end_date >= start_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (origin_location_id) REFERENCES locations(id),
  FOREIGN KEY (destination_location_id) REFERENCES locations(id),
  INDEX idx_trips_status_dates (status, start_date, end_date)
) ENGINE=InnoDB;

CREATE TABLE connections (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  requester_id  INT UNSIGNED NOT NULL,
  addressee_id  INT UNSIGNED NOT NULL,
  trip_id       INT UNSIGNED NULL,
  message       VARCHAR(300) NOT NULL DEFAULT '',
  status        ENUM('pending','accepted','rejected','withdrawn') NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- one active (pending/accepted) row per unordered pair
  pair_low      INT UNSIGNED AS (LEAST(requester_id, addressee_id)) STORED,
  pair_high     INT UNSIGNED AS (GREATEST(requester_id, addressee_id)) STORED,
  active_flag   TINYINT AS (IF(status IN ('pending','accepted'), 1, NULL)) STORED,
  UNIQUE KEY uq_connection_active_pair (pair_low, pair_high, active_flag),
  CONSTRAINT chk_connection_not_self CHECK (requester_id <> addressee_id),
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE posts (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  ride_id     INT UNSIGNED NULL,
  body        TEXT NOT NULL,
  is_hidden   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE SET NULL,
  INDEX idx_posts_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE comments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id     INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  body        VARCHAR(1000) NOT NULL,
  is_hidden   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE reviews (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_id      INT UNSIGNED NOT NULL,
  reviewer_id  INT UNSIGNED NOT NULL,
  rating       TINYINT UNSIGNED NOT NULL,
  comment      VARCHAR(1000) NOT NULL DEFAULT '',
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_review_ride_user (ride_id, reviewer_id),
  CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5),
  FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE reports (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reporter_id  INT UNSIGNED NOT NULL,
  target_type  ENUM('user','ride','post','comment') NOT NULL,
  target_id    INT UNSIGNED NOT NULL,
  reason       VARCHAR(500) NOT NULL,
  status       ENUM('open','resolved','dismissed') NOT NULL DEFAULT 'open',
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_reports_status (status)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  type        VARCHAR(40) NOT NULL,
  payload     JSON NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notifications_user (user_id, is_read, created_at)
) ENGINE=InnoDB;

-- `sessions` table is created automatically by express-mysql-session.
