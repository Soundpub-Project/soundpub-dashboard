# =============================================
# Run trigger creation via Docker exec
# Execute this on your VPS server
# =============================================

# Step 1: Copy SQL file to the server (if you're running this locally)
# scp docs/soundpub-local-migration/44-create-trigger-direct-as-admin.sql maskhar@supabase-server:~/

# Step 2: Connect to database container and run SQL as postgres superuser
docker exec -i supabase-db psql -U postgres -d postgres < ~/44-create-trigger-direct-as-admin.sql

# Alternative: Interactive psql session
# docker exec -it supabase-db psql -U postgres -d postgres

# Then you can manually paste the SQL content or run: \i /path/to/file.sql
