
# Rencana Migrasi Data User

## Ringkasan Data yang Perlu Dimigrasikan

### NAWAKEWED
| Data | Old UID | New UID |
|------|---------|---------|
| Profile | `eacb62d9-368a-493f-b7cc-d0b79bdd5cc6` | `20df61cb-a8f3-416f-951b-00f4d5fe5dcb` |
| 1 Release | label_id perlu diupdate | - |
| 2 Audit Logs | target_id perlu diupdate | - |

### KADITRUDIT
| Data | Old UID | New UID |
|------|---------|---------|
| Profile | `34cc76f4-7c20-46ef-95ad-6d321c02e0db` | `a92e518b-e0ae-4639-be1c-ac44947139cb` |
| 2 Releases | label_id perlu diupdate | - |
| 1 Artist Profile (SIMM) | parent_label_id perlu diupdate | - |
| 1 User Role (label) | perlu dihapus | sudah ada (whitelabel) |

---

## Langkah Migrasi

### Step 1: Update Releases
Update `label_id` dari UID lama ke UID baru untuk kedua user.

```sql
-- NAWAKEWED releases
UPDATE releases 
SET label_id = '20df61cb-a8f3-416f-951b-00f4d5fe5dcb'
WHERE label_id = 'eacb62d9-368a-493f-b7cc-d0b79bdd5cc6';

-- KADITRUDIT releases
UPDATE releases 
SET label_id = 'a92e518b-e0ae-4639-be1c-ac44947139cb'
WHERE label_id = '34cc76f4-7c20-46ef-95ad-6d321c02e0db';
```

### Step 2: Update Parent Label References
Update `parent_label_id` di profiles untuk artist yang dimiliki KADITRUDIT.

```sql
-- Update SIMM's parent_label_id ke KADITRUDIT baru
UPDATE profiles 
SET parent_label_id = 'a92e518b-e0ae-4639-be1c-ac44947139cb'
WHERE parent_label_id = '34cc76f4-7c20-46ef-95ad-6d321c02e0db';
```

### Step 3: Update Audit Logs
Update referensi di audit_logs untuk NAWAKEWED.

```sql
-- Update audit logs target_id
UPDATE audit_logs 
SET target_id = '20df61cb-a8f3-416f-951b-00f4d5fe5dcb'
WHERE target_id = 'eacb62d9-368a-493f-b7cc-d0b79bdd5cc6';
```

### Step 4: Transfer Balance (jika ada)
Kedua user memiliki balance = 0, jadi tidak perlu transfer.

### Step 5: Hapus User Roles Lama
```sql
-- Hapus role lama KADITRUDIT
DELETE FROM user_roles 
WHERE user_id = '34cc76f4-7c20-46ef-95ad-6d321c02e0db';

-- Hapus role lama NAWAKEWED (jika ada)
DELETE FROM user_roles 
WHERE user_id = 'eacb62d9-368a-493f-b7cc-d0b79bdd5cc6';
```

### Step 6: Hapus Profiles Lama
```sql
-- Hapus profile lama NAWAKEWED
DELETE FROM profiles 
WHERE id = 'eacb62d9-368a-493f-b7cc-d0b79bdd5cc6';

-- Hapus profile lama KADITRUDIT
DELETE FROM profiles 
WHERE id = '34cc76f4-7c20-46ef-95ad-6d321c02e0db';
```

---

## Catatan Penting

1. **Urutan eksekusi sangat penting** - Foreign key constraints mengharuskan kita mengupdate referensi terlebih dahulu sebelum menghapus data lama.

2. **Error FK Constraint sebelumnya** - Gagal menghapus NAWAKEWED karena ada profile (SIMM) yang mereferensi ke KADITRUDIT sebagai parent_label. Setelah Step 2, constraint ini akan teratasi.

3. **Auth Users** - Profile akan dihapus, tetapi entry di `auth.users` masih ada. Jika ingin menghapus auth user juga, perlu dilakukan melalui edge function `delete-user` setelah semua data dimigrasikan.

---

## Implementasi

Saya akan menggunakan **database insert tool** untuk menjalankan query UPDATE dan DELETE ini secara berurutan. Semua perubahan akan dilakukan dalam satu batch untuk memastikan konsistensi data.
