INSERT INTO Soundpub.app_settings (key, value)
VALUES ('release_price_custom_label', '75000')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

NOTIFY pgrst, 'reload schema';
