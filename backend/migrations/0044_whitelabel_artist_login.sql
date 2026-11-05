CREATE UNIQUE INDEX backend_users_email_unique ON soundpub.backend_users (lower(email)) WHERE email IS NOT NULL;

GRANT INSERT (id,full_name,phone,address,parent_label_id,password_set) ON soundpub.profiles TO soundpub_app;
GRANT UPDATE (password_set,updated_at) ON soundpub.profiles TO soundpub_app;
