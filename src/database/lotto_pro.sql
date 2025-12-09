CREATE DATABASE lotto_pro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lotto_pro;



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
CREATE TABLE STORE (
    store_id INT PRIMARY KEY AUTO_INCREMENT,
    owner_id INT NOT NULL,
    store_name VARCHAR(100) NOT NULL,
    address VARCHAR(255),
    contact_number VARCHAR(20),
    login_email VARCHAR(100) UNIQUE NOT NULL,
    login_password VARCHAR(255) NOT NULL,
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

-- Ticket Scan Log Table
CREATE TABLE TICKET_SCAN_LOG (
    scan_id INT PRIMARY KEY AUTO_INCREMENT,
    book_id INT NOT NULL,
    ticket_number INT NOT NULL,
    scan_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    clerk_name VARCHAR(100),
    remarks VARCHAR(255),
    FOREIGN KEY(book_id) REFERENCES store_lottery_inventory(id)
);

-- Daily Report Table
CREATE TABLE DAILY_REPORT (
    report_id INT PRIMARY KEY AUTO_INCREMENT,
    store_id INT NOT NULL,
    owner_id INT NOT NULL,
    lottery_id INT NOT NULL,
    book_id INT NOT NULL,
    date DATE NOT NULL,
    tickets_sold INT NOT NULL,
    remaining_tickets INT NOT NULL,
    start_ticket_number INT NOT NULL,
    closing_ticket_number INT NOT NULL,
    total_sales DECIMAL(10,2) NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(store_id) REFERENCES STORE(store_id),
    FOREIGN KEY(owner_id) REFERENCES STORE_OWNER(owner_id),
    FOREIGN KEY(lottery_id) REFERENCES LOTTERY_MASTER(lottery_id),
    FOREIGN KEY(book_id) REFERENCES store_lottery_inventory(id)
);

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
