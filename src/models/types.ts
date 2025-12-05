// Database model types

export interface User {
  id: number;
  email: string;
  password_hash: string;
  full_name: string;
  phone?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Store {
  id: number;
  owner_id: number;
  name: string;
  address: string;
  phone?: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface LotteryType {
  id: number;
  name: string;
  price: number;
  image_emoji?: string;
  description?: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface StoreLotteryInventory {
  id: number;
  store_id: number;
  lottery_type_id: number;
  total_count: number;
  current_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface Ticket {
  id: number;
  inventory_id: number;
  ticket_number: number;
  sold: boolean;
  sold_date?: Date;
  customer_name?: string;
  barcode?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ScannedTicket {
  id: number;
  store_id: number;
  ticket_id?: number;
  barcode_data: string;
  lottery_type_id?: number;
  ticket_number?: number;
  scanned_by?: number;
  scanned_at: Date;
}

// Request/Response types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
}

export interface AuthResponse {
  user: Omit<User, 'password_hash'>;
  token: string;
}

export interface CreateStoreRequest {
  name: string;
  address: string;
  phone?: string;
}

export interface ScanTicketRequest {
  barcode_data: string;
  store_id: number;
}

export interface DecodedBarcodeData {
  lottery_type_id?: number;
  ticket_number?: number;
  isValid: boolean;
  raw: string;
  error?: string;
}

/// super admin interface
export interface SuperAdmin {
  super_admin_id: number;
  name: string;
  email: string;
  password: string; // hashed
  created_at: Date;
}