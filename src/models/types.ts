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
  store_name: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  lottery_ac_no: string;
  lottery_pw: string;
  created_at: Date;
  updated_at?: Date;
}

export interface LotteryType {
  lottery_id: number;
  lottery_name: string;
  lottery_number: string;
  price: number;
  launch_date?: string;
  state?: string;
  start_number: number;
  end_number: number;
  status: LotteryStatus;
  image_url?: string;
  created_at: Date;
  updated_at: Date;
}

export interface StoreLotteryInventory {
  id: number;
  store_id: number;
  lottery_id: number;
  serial_number?: string;
  total_count: number;
  current_count: number;
  direction?: 'unknown' | 'asc' | 'desc';
  status?: string;
  created_at: Date;
  updated_at: Date;
}

export interface DailyReport {
  report_id: number;
  store_id: number;
  lottery_id: number;
  book_id: number;
  scan_id: number;
  report_date: string;
  opening_ticket: number;
  closing_ticket: number;
  tickets_sold: number;
  total_sales: number;
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
  identifier?: string;
  email?: string;
  password?: string;
  lottery_ac_no?: string;
  lottery_pw?: string;
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
  store_name: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  lottery_ac_no: string;
  lottery_pw: string;
}

export interface ScanTicketRequest {
  store_id: number;
  barcode_data?: string;
  lottery_number?: string;
  ticket_serial?: string;
  pack_number?: number;
  ticket_number?: number;
  direction?: 'asc' | 'desc';
}

export interface DecodedBarcodeData {
  lottery_number?: string;
  ticket_serial?: string;
  pack_number?: number;
  isValid: boolean;
  raw: string;
  error?: string;
}
export interface StoreLoginRequest {
  lottery_ac_no: string;
  lottery_pw: string;
}

/// super admin interface
export interface SuperAdmin {
  super_admin_id: number;
  name: string;
  email: string;
  password: string; // hashed
  created_at: Date;
}

///// lottery master

export type LotteryStatus = 'active' | 'inactive';
export interface LotteryMaster {
  lottery_id: number;
  lottery_name: string;
  lottery_number: string;
  price: number;
  launch_date?: string;
  state?: string;
  start_number: number;
  end_number: number;
  status: LotteryStatus;
  image_url?: string;
  created_at: Date;
  updated_at?: Date;
}

//// super admin and lottery master 
export interface SuperAdminLottery {
  super_admin_id: number;  // FK to SUPER_ADMIN
  lottery_id: number;      // FK to LOTTERY_MASTER
  assigned_at: Date;
}
