import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://kcsixeaqngdfegomsidh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtjc2l4ZWFxbmdkZmVnb21zaWRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTc5NzMsImV4cCI6MjA4OTgzMzk3M30.DXM3-Bp1p4vTalZdWyMZLRT7VR6Shb7XJEjo-hDKYhU';

export const supabase = createClient(SUPABASE_URL, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtjc2l4ZWFxbmdkZmVnb21zaWRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTc5NzMsImV4cCI6MjA4OTgzMzk3M30.DXM3-Bp1p4vTalZdWyMZLRT7VR6Shb7XJEjo-hDKYhU');
