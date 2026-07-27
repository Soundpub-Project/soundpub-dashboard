#!/bin/bash
# generate-supabase-keys.sh
# Script untuk generate JWT keys untuk Supabase

echo "=== Supabase Key Generator ==="
echo ""

# Generate random secrets
JWT_SECRET=$(openssl rand -base64 48 | tr -d "=+/" | cut -c1-64)
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
VAULT_ENC_KEY=$(openssl rand -base64 48 | tr -d "=+/" | cut -c1-64)
PG_META_CRYPTO_KEY=$(openssl rand -base64 48 | tr -d "=+/" | cut -c1-64)
SECRET_KEY_BASE=$(openssl rand -base64 48 | tr -d "=+/" | cut -c1-64)

echo "Secrets generated successfully!"
echo ""
echo "=== Copy these to your .env file ==="
echo ""
echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"
echo "JWT_SECRET=$JWT_SECRET"
echo "VAULT_ENC_KEY=$VAULT_ENC_KEY"
echo "PG_META_CRYPTO_KEY=$PG_META_CRYPTO_KEY"
echo "SECRET_KEY_BASE=$SECRET_KEY_BASE"
echo ""
echo "=== For ANON_KEY and SERVICE_ROLE_KEY ==="
echo ""
echo "Use https://jwt.io with the following:"
echo ""
echo "Algorithm: HS256"
echo "Secret: $JWT_SECRET"
echo ""
echo "Payload for ANON_KEY:"
echo '{"iss":"supabase","role":"anon","exp":1983812996}'
echo ""
echo "Payload for SERVICE_ROLE_KEY:"
echo '{"iss":"supabase","role":"service_role","exp":1983812996}'
echo ""
echo "Or use Supabase CLI:"
echo "npx supabase gen keys --anon"
echo "npx supabase gen keys --service-role"
echo ""
