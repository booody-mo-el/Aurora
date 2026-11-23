import { createClient, type SupabaseClient } from '@supabase/supabase-js';
export let supabase: SupabaseClient | null = null;
export async function initializeSupabase(){
 if(supabase)return supabase;
 try{
  const response=await fetch('/api/config');
  const config=await response.json();
  if(config.supabaseUrl&&config.supabaseAnonKey)supabase=createClient(config.supabaseUrl,config.supabaseAnonKey);
 }catch{ /* Browse mode remains available until Supabase is configured. */ }
 return supabase;
}
