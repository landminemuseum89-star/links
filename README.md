# Cambodia Landmine Museum Links

Linktree-style public page and admin dashboard for Cambodia Landmine Museum QR campaigns.

## Vercel settings

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

## Required environment variables

```env
SUPABASE_URL=https://impzieqrmqlxrwgcpvaf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_BUCKET=profile-images
ADMIN_EMAIL=landminemuseum89@gmail.com
ADMIN_PASSWORD=aki123
```

Run the SQL migration in `supabase/migrations/202609160001_links_schema.sql` before using the production deployment.
