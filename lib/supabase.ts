import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type Role = 'crew' | 'manager' | 'owner';

export interface Employee {
  id: string;
  name: string;
  phone: string;
  role: Role;
  tenant_id?: string;
  telegram_id?: string;
  whatsapp_number?: string;
  created_at: string;
}

export interface Job {
  id: string;
  name: string;
  address: string;
  status: 'quoted' | 'scheduled' | 'in_progress' | 'complete' | 'invoiced' | 'on_hold' | 'active';
  latitude?: number;
  longitude?: number;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  tenant_id?: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  job_id: string;
  tenant_id?: string;
  amount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  due_date?: string;
  sent_at?: string;
  paid_at?: string;
  stripe_invoice_id?: string;
  created_at: string;
  jobs?: { name: string; address: string; client_id?: string };
  clients?: { name: string; email?: string };
}

export interface ServiceAgreement {
  id: string;
  job_id: string;
  tenant_id?: string;
  title: string;
  body: string;
  status: 'draft' | 'sent' | 'signed';
  signed_at?: string;
  created_at: string;
  jobs?: { name: string };
}

export interface SupplyRequest {
  id: string;
  job_id: string;
  employee_id: string;
  items: string;
  urgency: 'same_day' | 'next_day';
  status: 'pending' | 'ordered' | 'delivered';
  photo_url?: string;
  created_at: string;
  jobs?: { name: string };
  employees?: { name: string };
}
