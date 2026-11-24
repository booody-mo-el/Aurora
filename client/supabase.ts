import { createClient, type SupabaseClient } from '@supabase/supabase-js';
export let supabase: SupabaseClient | null = null;
export async function initializeSupabase(){
 if(supabase)return supabase;
 try{
  const response=await fetch('/api/config');
  const config=await response.json();
  const normalizedUrl=(config.supabaseUrl||'').trim().replace(/\/(rest|auth|storage|realtime|functions)\/v1\/?.*$/i,'').replace(/\/+$/,'');
  if(normalizedUrl&&config.supabaseAnonKey)supabase=createClient(normalizedUrl,config.supabaseAnonKey.trim());
 }catch{ /* Browse mode remains available until Supabase is configured. */ }
 return supabase;
}
