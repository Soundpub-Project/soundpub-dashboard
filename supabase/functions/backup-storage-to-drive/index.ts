import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DRIVE_GATEWAY = 'https://connector-gateway.lovable.dev/google_drive'
const ROOT_FOLDER_NAME = 'SoundPub-Backup'
const BUCKETS = [
  'track-audio',
  'track-video',
  'audio-clips',
  'release-covers',
  'label-logos',
  'avatars',
  'iccn-gallery',
  'klikus-biolink',
]
const MAX_FILES_PER_RUN = 40 // keep within edge function timeout
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024 // 200MB cap to avoid OOM

function driveHeaders() {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!
  const GOOGLE_DRIVE_API_KEY = Deno.env.get('GOOGLE_DRIVE_API_KEY')!
  return {
    'Authorization': `Bearer ${LOVABLE_API_KEY}`,
    'X-Connection-Api-Key': GOOGLE_DRIVE_API_KEY,
  }
}

async function findOrCreateFolder(name: string, parentId: string | null): Promise<string> {
  const q = parentId
    ? `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`

  const searchUrl = `${DRIVE_GATEWAY}/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`
  const sr = await fetch(searchUrl, { headers: driveHeaders() })
  if (sr.ok) {
    const sd = await sr.json()
    if (sd.files?.[0]?.id) return sd.files[0].id
  }

  const body: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  }
  if (parentId) body.parents = [parentId]

  const cr = await fetch(`${DRIVE_GATEWAY}/drive/v3/files?fields=id`, {
    method: 'POST',
    headers: { ...driveHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!cr.ok) throw new Error(`Drive folder create failed: ${cr.status} ${await cr.text()}`)
  const cd = await cr.json()
  return cd.id
}

async function uploadToDrive(fileName: string, parentId: string, blob: Blob): Promise<string> {
  const metadata = { name: fileName, parents: [parentId] }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('file', blob)

  const r = await fetch(`${DRIVE_GATEWAY}/upload/drive/v3/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: driveHeaders(),
    body: form,
  })
  if (!r.ok) throw new Error(`Drive upload failed: ${r.status} ${await r.text()}`)
  const d = await r.json()
  return d.id
}

async function listAllFilesInBucket(supabase: any, bucket: string, prefix = ''): Promise<Array<{ path: string; size: number; updated_at: string | null }>> {
  const out: Array<{ path: string; size: number; updated_at: string | null }> = []
  const stack: string[] = [prefix]
  while (stack.length) {
    const cur = stack.pop()!
    let offset = 0
    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(cur, {
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw new Error(`List ${bucket}/${cur} failed: ${error.message}`)
      if (!data || data.length === 0) break
      for (const item of data) {
        if (!item.name) continue
        const fullPath = cur ? `${cur}/${item.name}` : item.name
        if (item.id === null || item.metadata === null) {
          // folder
          stack.push(fullPath)
        } else {
          out.push({
            path: fullPath,
            size: (item.metadata?.size as number) ?? 0,
            updated_at: (item.updated_at as string) ?? null,
          })
        }
      }
      if (data.length < 1000) break
      offset += 1000
    }
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  // ---------- Authorization ----------
  // Only allow: (a) cron caller with matching X-Cron-Secret header,
  //             (b) service-role JWT (internal invoke), or
  //             (c) an authenticated admin/superadmin user.
  const cronSecret = Deno.env.get('CRON_BACKUP_SECRET')
  const providedCronSecret = req.headers.get('x-cron-secret')
  let authorized = false
  let triggeredBy = 'unknown'

  if (cronSecret && providedCronSecret && providedCronSecret === cronSecret) {
    authorized = true
    triggeredBy = 'cron'
  } else {
    const authHeader = req.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '')
      try {
        const { data: claimsData } = await supabase.auth.getClaims(token)
        const claims = claimsData?.claims as { sub?: string; role?: string } | undefined
        if (claims?.role === 'service_role') {
          authorized = true
          triggeredBy = 'service_role'
        } else if (claims?.sub) {
          const { data: roleRow } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', claims.sub)
            .in('role', ['admin', 'superadmin'])
            .maybeSingle()
          if (roleRow) {
            authorized = true
            triggeredBy = `admin:${claims.sub}`
          }
        }
      } catch (_e) {
        // fall through to unauthorized
      }
    }
  }

  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Insert run record
  const { data: runRow } = await supabase
    .from('storage_backup_runs')
    .insert({ status: 'running', triggered_by: req.headers.get('x-trigger') ?? triggeredBy })
    .select('id')
    .single()
  const runId = runRow?.id

  let uploaded = 0
  let skipped = 0
  let errors = 0
  const errorList: string[] = []

  try {
    if (!Deno.env.get('GOOGLE_DRIVE_API_KEY')) throw new Error('GOOGLE_DRIVE_API_KEY not set (Drive connector not linked)')
    if (!Deno.env.get('LOVABLE_API_KEY')) throw new Error('LOVABLE_API_KEY not set')

    const dateStr = new Date().toISOString().slice(0, 10)
    const rootId = await findOrCreateFolder(ROOT_FOLDER_NAME, null)
    const dateFolderId = await findOrCreateFolder(dateStr, rootId)

    const folderCache = new Map<string, string>()
    folderCache.set('__root__', dateFolderId)

    const ensurePath = async (bucket: string, dir: string): Promise<string> => {
      const key = `${bucket}::${dir}`
      if (folderCache.has(key)) return folderCache.get(key)!
      const parentKey = dir.includes('/') ? `${bucket}::${dir.split('/').slice(0, -1).join('/')}` : `${bucket}::__bucket__`
      let parentId: string
      if (!dir.includes('/')) {
        // need bucket folder
        if (!folderCache.has(`${bucket}::__bucket__`)) {
          const bId = await findOrCreateFolder(bucket, dateFolderId)
          folderCache.set(`${bucket}::__bucket__`, bId)
        }
        parentId = folderCache.get(`${bucket}::__bucket__`)!
      } else {
        parentId = await ensurePath(bucket, dir.split('/').slice(0, -1).join('/'))
      }
      const segName = dir.split('/').pop()!
      const fId = await findOrCreateFolder(segName, parentId)
      folderCache.set(key, fId)
      return fId
    }

    for (const bucket of BUCKETS) {
      if (uploaded + skipped >= MAX_FILES_PER_RUN * 50) break
      let files: Array<{ path: string; size: number; updated_at: string | null }>
      try {
        files = await listAllFilesInBucket(supabase, bucket)
      } catch (e) {
        errors++
        errorList.push(`bucket ${bucket}: ${(e as Error).message}`)
        continue
      }

      for (const f of files) {
        if (uploaded >= MAX_FILES_PER_RUN) break
        try {
          // check log
          const { data: existing } = await supabase
            .from('storage_backup_log')
            .select('id, source_updated_at')
            .eq('bucket', bucket)
            .eq('path', f.path)
            .maybeSingle()

          if (existing && existing.source_updated_at === f.updated_at) {
            skipped++
            continue
          }

          if (f.size > MAX_FILE_SIZE_BYTES) {
            skipped++
            errorList.push(`skip large ${bucket}/${f.path} (${f.size}b)`)
            continue
          }

          // download from supabase storage
          const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(f.path)
          if (dlErr || !blob) throw new Error(`download fail: ${dlErr?.message}`)

          // ensure folder structure mirrors source path
          const dir = f.path.includes('/') ? f.path.split('/').slice(0, -1).join('/') : ''
          const fileName = f.path.split('/').pop()!
          let parentId: string
          if (dir === '') {
            if (!folderCache.has(`${bucket}::__bucket__`)) {
              const bId = await findOrCreateFolder(bucket, dateFolderId)
              folderCache.set(`${bucket}::__bucket__`, bId)
            }
            parentId = folderCache.get(`${bucket}::__bucket__`)!
          } else {
            parentId = await ensurePath(bucket, dir)
          }

          const driveFileId = await uploadToDrive(fileName, parentId, blob)

          await supabase.from('storage_backup_log').upsert({
            bucket,
            path: f.path,
            size_bytes: f.size,
            drive_file_id: driveFileId,
            drive_folder_id: parentId,
            source_updated_at: f.updated_at,
            last_backed_up_at: new Date().toISOString(),
          }, { onConflict: 'bucket,path' })

          uploaded++
        } catch (e) {
          errors++
          errorList.push(`${bucket}/${f.path}: ${(e as Error).message}`)
        }
      }
    }

    await supabase.from('storage_backup_runs').update({
      finished_at: new Date().toISOString(),
      status: errors > 0 ? 'partial' : 'success',
      files_uploaded: uploaded,
      files_skipped: skipped,
      errors_count: errors,
      error_message: errorList.slice(0, 20).join('\n') || null,
    }).eq('id', runId)

    return new Response(JSON.stringify({ success: true, uploaded, skipped, errors, run_id: runId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = (e as Error).message
    await supabase.from('storage_backup_runs').update({
      finished_at: new Date().toISOString(),
      status: 'failed',
      files_uploaded: uploaded,
      files_skipped: skipped,
      errors_count: errors + 1,
      error_message: msg,
    }).eq('id', runId)
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})