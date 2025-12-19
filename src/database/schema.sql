-- Lottery Pro Database Schema

-- Super Admin Table
CREATE TABLE SUPER_ADMIN (
    super_admin_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lottery Master Table
CREATE TABLE LOTTERY_MASTER (
    lottery_id INT PRIMARY KEY AUTO_INCREMENT,
    lottery_name VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    start_number INT NOT NULL,
    end_number INT NOT NULL,
    status ENUM('active','inactive') DEFAULT 'inactive',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Many-to-many between Super Admin and Lottery Master
CREATE TABLE SUPER_ADMIN_LOTTERY (
    super_admin_id INT,
    lottery_id INT,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(super_admin_id, lottery_id),
    FOREIGN KEY(super_admin_id) REFERENCES SUPER_ADMIN(super_admin_id),
    FOREIGN KEY(lottery_id) REFERENCES LOTTERY_MASTER(lottery_id)
);

-- Store Owner Table
CREATE TABLE STORE_OWNER (
    owner_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Store Table
CREATE TABLE STORES (
    store_id INT PRIMARY KEY AUTO_INCREMENT,
    owner_id INT NOT NULL,
    store_name VARCHAR(100) NOT NULL,
    address VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    zipcode VARCHAR(20),
    is_24_hours TINYINT(1) DEFAULT 0,
    closing_time TIME NULL,
    lottery_ac_no VARCHAR(50) UNIQUE NOT NULL,
    lottery_pw VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(owner_id) REFERENCES STORE_OWNER(owner_id)
);

-- Store Lottery Inventory Table
CREATE TABLE STORE_LOTTERY_INVENTORY (
    id INT PRIMARY KEY AUTO_INCREMENT,
    store_id INT NOT NULL,
    lottery_id INT NOT NULL,
    serial_number VARCHAR(32),
    total_count INT NOT NULL,
    current_count INT NOT NULL,
    direction ENUM('unknown','asc','desc') DEFAULT 'unknown',
    status ENUM('inactive','active','finished') DEFAULT 'inactive',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY(store_id) REFERENCES STORES(store_id),
    FOREIGN KEY(lottery_id) REFERENCES LOTTERY_MASTER(lottery_id)
);

-- Daily Report Table
CREATE TABLE DAILY_REPORT (
    report_id INT PRIMARY KEY AUTO_INCREMENT,
    store_id INT NOT NULL,
    lottery_id INT NOT NULL,
    book_id INT NOT NULL,
    scan_id INT NOT NULL,
    report_date DATE NOT NULL,
    tickets_sold INT NOT NULL DEFAULT 0,
    total_sales DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_daily_report (store_id, lottery_id, book_id, report_date),
    FOREIGN KEY(store_id) REFERENCES STORES(store_id),
    FOREIGN KEY(lottery_id) REFERENCES LOTTERY_MASTER(lottery_id),
    FOREIGN KEY(book_id) REFERENCES STORE_LOTTERY_INVENTORY(id),
    FOREIGN KEY(scan_id) REFERENCES SCANNED_TICKETS(id)
);

-- Store Notification Settings
CREATE TABLE STORE_NOTIFICATION_SETTINGS (
    id INT PRIMARY KEY AUTO_INCREMENT,
    owner_id INT NOT NULL UNIQUE,
    push_notifications TINYINT(1) DEFAULT 1,
    email_notifications TINYINT(1) DEFAULT 1,
    sms_notifications TINYINT(1) DEFAULT 0,
    low_stock_alerts TINYINT(1) DEFAULT 1,
    sales_updates TINYINT(1) DEFAULT 1,
    inventory_alerts TINYINT(1) DEFAULT 1,
    system_updates TINYINT(1) DEFAULT 1,
    weekly_reports TINYINT(1) DEFAULT 1,
    daily_summary TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY(owner_id) REFERENCES STORE_OWNER(owner_id) ON DELETE CASCADE
);

CREATE TABLE STORE_NOTIFICATIONS (
    id INT PRIMARY KEY AUTO_INCREMENT,
    owner_id INT NOT NULL,
    store_id INT NOT NULL,
    notification_type ENUM('low_stock','inventory_alert','sales_update','system') NOT NULL,
    title VARCHAR(150),
    message TEXT NOT NULL,
    metadata JSON NULL,
    is_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(owner_id) REFERENCES STORE_OWNER(owner_id) ON DELETE CASCADE,
    FOREIGN KEY(store_id) REFERENCES STORES(store_id) ON DELETE CASCADE
);

CREATE INDEX idx_store_notifications_owner ON STORE_NOTIFICATIONS (owner_id, is_read, created_at);

-- Owner Report View
CREATE VIEW OWNER_REPORT AS
SELECT
    dr.owner_id,
    s.store_name,
    l.lottery_name,
    SUM(dr.tickets_sold) AS total_tickets_sold,
    SUM(dr.total_sales) AS total_sales,
    MIN(dr.start_ticket_number) AS start_ticket,
    MAX(dr.closing_ticket_number) AS end_ticket,
    MIN(dr.date) AS start_date,
    MAX(dr.date) AS end_date
FROM DAILY_REPORT dr
JOIN STORE s ON dr.store_id = s.store_id
JOIN LOTTERY_MASTER l ON dr.lottery_id = l.lottery_id
GROUP BY dr.owner_id, s.store_name, l.lottery_name;
