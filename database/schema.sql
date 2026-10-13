-- Aman dijalankan ulang: tidak menghapus data yang sudah ada.
CREATE TABLE IF NOT EXISTS customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL UNIQUE,
  email VARCHAR(150) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(30) NOT NULL UNIQUE,
  capacity INT UNSIGNED NOT NULL,
  area VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menu_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  category VARCHAR(30) NOT NULL,
  price INT UNSIGNED NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reservations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  table_id INT UNSIGNED NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  guests INT UNSIGNED NOT NULL,
  status ENUM('confirmed','seated','completed','cancelled') NOT NULL DEFAULT 'confirmed',
  notes VARCHAR(500) NOT NULL DEFAULT '',
  total INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reservation_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_reservation_table FOREIGN KEY (table_id) REFERENCES restaurant_tables(id),
  INDEX idx_table_schedule (table_id, start_at, end_at, status),
  INDEX idx_reservation_date (start_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT UNSIGNED NOT NULL,
  menu_item_id INT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  unit_price INT UNSIGNED NOT NULL,
  CONSTRAINT fk_order_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_menu FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
  UNIQUE KEY uq_reservation_menu (reservation_id, menu_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO restaurant_tables (name, capacity, area) VALUES
('Meja 01', 2, 'Indoor'), ('Meja 02', 2, 'Indoor'),
('Meja 03', 4, 'Indoor'), ('Meja 04', 4, 'Indoor'),
('Meja 05', 6, 'Teras'), ('Meja 06', 8, 'Teras');

INSERT IGNORE INTO menu_items (name, category, price) VALUES
('Nasi Goreng Nusantara', 'Makanan', 35000),
('Ayam Bakar Madu', 'Makanan', 42000),
('Sop Iga', 'Makanan', 58000),
('Mie Goreng Jawa', 'Makanan', 32000),
('Es Teh Melati', 'Minuman', 10000),
('Es Jeruk Segar', 'Minuman', 15000),
('Kopi Susu', 'Minuman', 22000),
('Pisang Goreng', 'Camilan', 20000);
