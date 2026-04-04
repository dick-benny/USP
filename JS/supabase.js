(function () {
  const SUPABASE_URL = 'https://kcsixeaqngdfegomsidh.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtjc2l4ZWFxbmdkZmVnb21zaWRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTc5NzMsImV4cCI6MjA4OTgzMzk3M30.DXM3-Bp1p4vTalZdWyMZLRT7VR6Shb7XJEjo-hDKYhU';

  if (!window.supabase || !window.supabase.createClient) {
    console.error('Supabase-klienten kunde inte laddas.');
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  window.PlanningSupabase = {
    config: {
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      projectRef: 'kcsixeaqngdfegomsidh',
      env: 'development'
    },
    client
  };
})();
