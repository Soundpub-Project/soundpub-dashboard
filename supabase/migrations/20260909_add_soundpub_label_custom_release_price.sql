INSERT INTO Soundpub.app_settings (key, value)
VALUES ('release_price_custom_label', '50000')
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
