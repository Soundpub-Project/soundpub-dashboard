import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { z } from 'zod';
import { ApiError } from '../api/types.js';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { createRepositories } from '../db/repositories.js';
import { withTransaction } from '../db/pool.js';
import { usersRepository } from '../users/repository.js';
import * as contracts from './contracts.js';
export * from './contracts.js';

type Schema = z.ZodType<unknown>;
type Input = Record<string, any>;
const allows = createAuthorizer();
const editable = new Set(['DRAFT', 'REVISION_REQUESTED']);
const reviewTransitions: Record<string, readonly string[]> = {
  PAID_PENDING_REVIEW: ['IN_REVIEW'],
  IN_REVIEW: ['REVISION_REQUESTED', 'APPROVED', 'REJECTED'],
  REVISION_REQUESTED: ['IN_REVIEW'],
};
const contractTransitions: Record<string, readonly string[]> = {
  DRAFT: ['GENERATED', 'VOID'], GENERATED: ['STAMPING_PENDING', 'VOID'],
  STAMPING_PENDING: ['STAMPED', 'VOID'], STAMPED: ['SIGNED', 'VOID'], SIGNED: ['ACTIVE', 'VOID'],
};

function schema(...names: string[]): Schema {
  const exported = contracts as Record<string, unknown>;
  const found = names.map(name => exported[name]).find(value => value && typeof (value as Schema).safeParse === 'function');
  if (!found) throw new Error(`Copyright registration contract missing: ${names.join(' or ')}`);
  return found as Schema;
}
function parse(names: string[], value: unknown): Input {
  const result = schema(...names).safeParse(value);
  if (!result.success || typeof result.data !== 'object' || result.data === null) throw new ApiError(400, 'BAD_REQUEST');
  return result.data as Input;
}
function requireActor(actor: Principal | undefined): asserts actor is Principal {
  if (!allows(actor ?? null, 'authenticated')) throw new ApiError(403, 'FORBIDDEN');
}
function requireKey(value: string) {
  if (!value || value.length > 200) throw new ApiError(400, 'BAD_REQUEST');
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const expires = () => new Date(Date.now() + 7 * 86_400_000);

const projection = `r.id,r.owner_id AS user_id,lower(r.status) AS status,r.legal_name,r.stage_name,
  r.identity_number AS nik,r.address->>'raw' AS address,r.phone,r.email,r.tax_number AS npwp,
  r.bank_name,r.bank_account_number,r.bank_account_name,lower(r.applicant_type) AS applicant_type,
  (SELECT p.composer_code FROM soundpub.profiles p WHERE p.id=r.owner_id) AS composer_code,
  (SELECT c.contract_number FROM soundpub.copyright_contracts c WHERE c.registration_id=r.id) AS contract_number,
  r.review_note AS admin_notes,r.revision_note AS revision_notes,r.version,
  to_char(r.submitted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS submitted_at,
  to_char(r.reviewed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS reviewed_at,
  to_char(r.approved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS approved_at,
  to_char(r.rejected_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS rejected_at,
  to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
  to_char(r.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',w.id,'registration_id',w.registration_id,'title',w.title,
    'alternate_title',w.alternate_title,'composer_name',w.composer_name,'lyricist_name',w.lyricist_name,
    'ownership_percentage',w.ownership_basis_points::numeric/100,'is_collaboration',w.collaboration,
    'cowriters',w.cowriters,'release_status',lower(w.release_status),'release_date',w.release_date,'isrc',w.isrc,
    'upc',w.upc,'links',w.links,'lyrics',w.lyrics,'notes',w.notes,
    'created_at',to_char(w.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'updated_at',to_char(w.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY w.position,w.id)
    FROM soundpub.copyright_registration_works w
    WHERE w.registration_id=r.id),'[]'::jsonb) AS works,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'file_type',CASE d.file_type
      WHEN 'IDENTITY' THEN 'ktp' WHEN 'TAX' THEN 'npwp' WHEN 'LYRICS' THEN 'lyrics_document' ELSE lower(d.file_type) END,
    'media_object_id',d.media_object_id,
    'file_name',m.original_filename,'mime_type',m.mime_type,'file_size',m.size,
    'uploaded_at',to_char(d.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'download_reference',d.media_object_id::text) ORDER BY d.created_at,d.id)
    FROM soundpub.copyright_registration_files d JOIN soundpub.media_objects m ON m.id=d.media_object_id
    WHERE d.registration_id=r.id),'[]'::jsonb) AS files,
  (SELECT jsonb_build_object('id',p.id,'registration_id',p.registration_id,
    'amount',to_char(p.amount_minor::numeric/100,'FM999999999999990.00'),'currency',p.currency,
    'payment_status',CASE p.status WHEN 'INTENT' THEN 'pending' WHEN 'PROVIDER_PENDING' THEN 'pending'
      WHEN 'RECONCILIATION_REQUIRED' THEN 'failed' ELSE lower(p.status) END,
    'provider_invoice_id',p.provider_invoice_id,'provider_invoice_url',p.provider_invoice_url,
    'paid_at',CASE WHEN p.paid_at IS NULL THEN NULL ELSE to_char(p.paid_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
    'created_at',to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'updated_at',to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
    FROM soundpub.copyright_registration_payments p WHERE p.registration_id=r.id
    ORDER BY p.created_at DESC,p.id DESC LIMIT 1) AS payment,
  (SELECT jsonb_build_object('id',c.id,'registration_id',c.registration_id,'contract_number',c.contract_number,
    'status',lower(c.status),'template_version',c.template_version,
    'media_object_id',COALESCE(c.signed_media_id,c.stamped_media_id,c.generated_media_id),
    'signed_at',CASE WHEN c.signed_at IS NULL THEN NULL ELSE to_char(c.signed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
    'stamped_at',CASE WHEN c.stamped_at IS NULL THEN NULL ELSE to_char(c.stamped_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
    'stamp_provider',c.stamp_provider,'version',c.version,
    'created_at',to_char(c.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'updated_at',to_char(c.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'download_reference',COALESCE(c.signed_media_id,c.stamped_media_id,c.generated_media_id)::text)
    FROM soundpub.copyright_contracts c WHERE c.registration_id=r.id) AS contract`;

export function createCopyrightRegistrationsService(pool: Pool) {
  async function currentActor(db: PoolClient, actor: Principal, write: boolean) {
    const value = (await usersRepository(db).lock([actor.id], write)).get(actor.id);
    requireActor(value);
    return value;
  }
  async function find(db: PoolClient, actor: Principal, id: string, write = false) {
    const current = await currentActor(db, actor, write);
    const admin = allows(current, 'admin');
    const row = (await db.query(`SELECT ${projection} FROM soundpub.copyright_registrations r
      WHERE r.id=$2 AND ($3::boolean OR r.owner_id=$1) ${write ? 'FOR UPDATE OF r' : ''}`,
    [current.id,id,admin])).rows[0];
    if (!row) throw new ApiError(404, 'NOT_FOUND');
    return { current, row };
  }
  async function complete(db: PoolClient, scope: string, key: string, response: unknown) {
    if (!await createRepositories(db).idempotency.complete({ scope,key,responseStatus:200,responseBody:response })) {
      throw new ApiError(409, 'CONFLICT');
    }
  }
  async function claim(db: PoolClient, scope: string, key: string, input: unknown) {
    const result = await createRepositories(db).idempotency.begin({ scope,key,requestHash:hash(input),expiresAt:expires() });
    if (result.state === 'completed') return result.responseBody;
    if (result.state !== 'new') throw new ApiError(409, 'CONFLICT');
    return null;
  }
  async function emit(db: PoolClient, actor: Principal, action: string, id: string, requestId: string,
    metadata: Record<string, unknown>, topic = action) {
    const repository = createRepositories(db);
    await repository.audit.append({ actorUserId:actor.id,action,resourceType:'copyright_registration',resourceId:id,
      metadata:{ requestId,...metadata } });
    await repository.outbox.enqueue({ topic,payload:{ registrationId:id,actorId:actor.id,...metadata },
      idempotencyKey:`${topic}:${id}:${metadata.version ?? hash(metadata).slice(0,16)}` });
  }
  async function history(db:PoolClient,id:string,from:string|null,to:string,actorId:string,key:string,note?:string|null) {
    await db.query(`INSERT INTO soundpub.copyright_registration_status_history
      (id,registration_id,old_status,new_status,changed_by,note,idempotency_key,request_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,[randomUUID(),id,from,to,actorId,note ?? null,key,
      hash({id,from,to,actorId,note:note ?? null})]);
  }

  return {
    async create(actor: Principal, value: unknown, idempotencyKey: string, requestId: string) {
      const input = parse(['copyrightRegistrationCreateDraft'], value); requireKey(idempotencyKey);
      return withTransaction(pool, async db => {
        const current = await currentActor(db, actor, true);
        const scope = `copyright-registration.create:${current.id}`;
        const replay = await claim(db,scope,idempotencyKey,input); if (replay) return replay;
        const existing = (await db.query('SELECT id FROM soundpub.copyright_registrations WHERE owner_id=$1 FOR UPDATE',[current.id])).rows[0];
        if (existing) throw new ApiError(409,'CONFLICT');
        if (!input.phone) throw new ApiError(400,'BAD_REQUEST');
        const id = randomUUID();
        const code = `CR-${id.replaceAll('-','').slice(0,12).toUpperCase()}`;
        await db.query(`INSERT INTO soundpub.copyright_registrations
          (id,registration_code,owner_id,status,legal_name,email,phone,applicant_type,address)
          VALUES ($1,$2,$3,'DRAFT',$4,$5,$6,$7,$8::jsonb)`,[id,code,current.id,input.legal_name,input.email,
          input.phone,String(input.applicant_type).toUpperCase(),JSON.stringify({})]);
        await emit(db,current,'copyright_registration.created',id,requestId,{version:1});
        const response=(await find(db,current,id)).row; await complete(db,scope,idempotencyKey,response); return response;
      });
    },
    async current(actor: Principal) {
      return withTransaction(pool, async db => {
        const current=await currentActor(db,actor,false);
        return (await db.query(`SELECT ${projection} FROM soundpub.copyright_registrations r
          WHERE r.owner_id=$1 ORDER BY r.created_at DESC,r.id DESC LIMIT 1`,[current.id])).rows[0] ?? null;
      });
    },
    async get(actor: Principal, id: string) { return withTransaction(pool, async db => (await find(db,actor,id)).row); },
    async list(actor: Principal, value: unknown = {}) {
      const query=parse(['copyrightRegistrationListQuery'],value);
      return withTransaction(pool, async db => {
        const current=await currentActor(db,actor,false); if(!allows(current,'admin')) throw new ApiError(404,'NOT_FOUND');
        const limit=Math.min(Number(query.limit ?? 50),100);
        const rows=(await db.query(`SELECT ${projection} FROM soundpub.copyright_registrations r
          WHERE ($1::text IS NULL OR r.status=upper($1)) AND ($2::text IS NULL OR strpos(lower(r.legal_name||' '||r.email),lower($2))>0)
          ORDER BY r.updated_at DESC,r.id DESC LIMIT $3`,[query.status ?? null,query.search ?? null,limit])).rows;
        return {items:rows,next_cursor:null};
      });
    },
    async replaceDraft(actor: Principal,id:string,value:unknown,idempotencyKey:string,requestId:string) {
      const input=parse(['copyrightRegistrationDraftReplace'],value); requireKey(idempotencyKey);
      return withTransaction(pool,async db=>{
        const {current,row}=await find(db,actor,id,true);
        if(row.user_id!==current.id || !editable.has(String(row.status).toUpperCase())) throw new ApiError(404,'NOT_FOUND');
        const scope=`copyright-registration.replace-draft:${id}`;
        const replay=await claim(db,scope,idempotencyKey,input); if(replay) return replay;
        const changed=await db.query(`UPDATE soundpub.copyright_registrations SET legal_name=$3,stage_name=$4,identity_number=$5,
          address=$6::jsonb,phone=$7,email=$8,tax_number=$9,bank_name=$10,bank_account_number=$11,
          bank_account_name=$12,applicant_type=$13,revision_note=NULL,updated_at=clock_timestamp()
          WHERE id=$1 AND version=$2 RETURNING id`,[id,input.version,input.legal_name,input.stage_name ?? null,input.nik ?? null,
          JSON.stringify({raw:input.address}),input.phone ?? row.phone,input.email,input.npwp ?? null,input.bank_name ?? null,
          input.bank_account_number ?? null,input.bank_account_name ?? null,String(input.applicant_type).toUpperCase()]);
        if(changed.rowCount!==1) throw new ApiError(409,'CONFLICT');
        await db.query('DELETE FROM soundpub.copyright_registration_works WHERE registration_id=$1',[id]);
        let position=0;
        for(const work of input.works ?? []) await db.query(`INSERT INTO soundpub.copyright_registration_works
          (id,registration_id,position,title,alternate_title,composer_name,lyricist_name,ownership_basis_points,collaboration,
           cowriters,release_status,release_date,isrc,upc,links,lyrics,notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15::jsonb,$16,$17)`,[randomUUID(),id,++position,work.title,
          work.alternate_title ?? null,work.composer_name,work.lyricist_name ?? null,Math.round(work.ownership_percentage*100),
          work.is_collaboration ?? false,JSON.stringify(work.cowriters ?? []),String(work.release_status).toUpperCase(),
          work.release_date ?? null,work.isrc ?? null,work.upc ?? null,JSON.stringify(work.links ?? work.links_json ?? []),
          work.lyrics ?? null,work.notes ?? null]);
        await emit(db,current,'copyright_registration.draft_replaced',id,requestId,{version:input.version+1});
        const response=(await find(db,current,id)).row; await complete(db,scope,idempotencyKey,response); return response;
      });
    },
    async submit(actor:Principal,id:string,value:unknown,idempotencyKey:string,requestId:string) {
      const input=parse(['copyrightRegistrationSubmit'],value); requireKey(idempotencyKey);
      return withTransaction(pool,async db=>{
        const {current,row}=await find(db,actor,id,true);
        if(row.user_id!==current.id || !editable.has(String(row.status).toUpperCase())) throw new ApiError(404,'NOT_FOUND');
        const scope=`copyright-registration.submit:${id}`;
        const replay=await claim(db,scope,idempotencyKey,input); if(replay) return replay;
        const counts=(await db.query<{works:number;identity:number;evidence:number}>(`SELECT
          (SELECT count(*)::int FROM soundpub.copyright_registration_works WHERE registration_id=$1) works,
          (SELECT count(*)::int FROM soundpub.copyright_registration_files WHERE registration_id=$1 AND file_type='IDENTITY') identity,
          (SELECT count(*)::int FROM soundpub.copyright_registration_files WHERE registration_id=$1 AND file_type='WORK_EVIDENCE') evidence`,[id])).rows[0]!;
        if(!row.legal_name || !row.email || counts.works<1 || counts.identity<1 || counts.evidence<1) throw new ApiError(409,'REGISTRATION_INCOMPLETE');
        const oldStatus=String(row.status).toUpperCase();
        const nextStatus=oldStatus==='REVISION_REQUESTED' ? 'IN_REVIEW' : 'AWAITING_PAYMENT';
        if(nextStatus==='IN_REVIEW' && !(await db.query(`SELECT 1 FROM soundpub.copyright_registration_payments
          WHERE registration_id=$1 AND status='PAID'`,[id])).rowCount) throw new ApiError(409,'PAYMENT_REQUIRED');
        const termsChecksum=createHash('sha256').update(`${input.declaration_version}:accepted`).digest('hex');
        const changed=await db.query(`UPDATE soundpub.copyright_registrations SET status=$3,
          terms_version=COALESCE(terms_version,$4),terms_checksum=COALESCE(terms_checksum,$5),
          terms_accepted_at=COALESCE(terms_accepted_at,clock_timestamp()),
          submitted_at=COALESCE(submitted_at,clock_timestamp()),updated_at=clock_timestamp()
          WHERE id=$1 AND version=$2 RETURNING id`,[id,input.version,nextStatus,input.declaration_version,termsChecksum]);
        if(changed.rowCount!==1) throw new ApiError(409,'CONFLICT');
        if(nextStatus==='AWAITING_PAYMENT') await db.query(`INSERT INTO soundpub.copyright_registration_payments
          (id,registration_id,owner_id,amount_minor,currency,status,idempotency_key,request_hash)
          VALUES ($1,$2,$3,10000000,'IDR','INTENT',$4,$5)
          ON CONFLICT (registration_id) DO NOTHING`,[randomUUID(),id,current.id,idempotencyKey,hash(input)]);
        if((await db.query('SELECT count(*)::int count FROM soundpub.copyright_registration_payments WHERE registration_id=$1',[id])).rows[0].count!==1) throw new ApiError(409,'CONFLICT');
        await history(db,id,oldStatus,nextStatus,current.id,idempotencyKey,
          nextStatus==='IN_REVIEW' ? 'Revised registration resubmitted.' : 'Registration submitted for payment.');
        await emit(db,current,'copyright_registration.submitted',id,requestId,{version:input.version+1},'copyright_registration.submitted');
        const response=(await find(db,current,id)).row; await complete(db,scope,idempotencyKey,response); return response;
      });
    },
    async review(actor:Principal,id:string,value:unknown,idempotencyKey:string,requestId:string) {
      const input=parse(['copyrightRegistrationReviewTransition'],value); requireKey(idempotencyKey);
      return withTransaction(pool,async db=>{
        const {current,row}=await find(db,actor,id,true); if(!allows(current,'admin')) throw new ApiError(404,'NOT_FOUND');
        const next=String(input.status).toUpperCase();
        if(!reviewTransitions[String(row.status).toUpperCase()]?.includes(next)) throw new ApiError(409,'CONFLICT');
        const scope=`copyright-registration.review:${id}`; const replay=await claim(db,scope,idempotencyKey,input); if(replay) return replay;
        if(['IN_REVIEW','APPROVED'].includes(next)) {
          const paid=(await db.query(`SELECT 1 FROM soundpub.copyright_registration_payments WHERE registration_id=$1 AND status='PAID'`,[id])).rowCount;
          if(!paid) throw new ApiError(409,'PAYMENT_REQUIRED');
        }
        const changed=await db.query(`UPDATE soundpub.copyright_registrations SET status=$3,review_note=$4,
          revision_note=CASE WHEN $3='REVISION_REQUESTED' THEN $4 ELSE NULL END,
          reviewed_at=clock_timestamp(),approved_at=CASE WHEN $3='APPROVED' THEN clock_timestamp() ELSE approved_at END,
          rejected_at=CASE WHEN $3='REJECTED' THEN clock_timestamp() ELSE rejected_at END,updated_at=clock_timestamp()
          WHERE id=$1 AND version=$2 RETURNING id`,[id,input.version,next,input.note ?? null]);
        if(changed.rowCount!==1) throw new ApiError(409,'CONFLICT');
        await history(db,id,String(row.status).toUpperCase(),next,current.id,idempotencyKey,input.note ?? null);
        if(next==='APPROVED') await db.query(`INSERT INTO soundpub.copyright_contracts
          (id,registration_id,status,template_version,template_checksum)
          VALUES ($1,$2,'DRAFT','soundpub-publishing-v1',$3) ON CONFLICT (registration_id) DO NOTHING`,
        [randomUUID(),id,createHash('sha256').update('soundpub-publishing-v1').digest('hex')]);
        if(next==='APPROVED' && input.composer_code) await db.query(`UPDATE soundpub.profiles
          SET composer_code=$2,updated_at=clock_timestamp() WHERE id=$1`,[row.user_id,input.composer_code]);
        await emit(db,current,'copyright_registration.reviewed',id,requestId,{from:row.status,to:next,version:input.version+1});
        const response=(await find(db,current,id)).row; await complete(db,scope,idempotencyKey,response); return response;
      });
    },
    async transitionContract(actor:Principal,id:string,value:unknown,idempotencyKey:string,requestId:string) {
      const input=parse(['copyrightContractTransition'],value); requireKey(idempotencyKey);
      return withTransaction(pool,async db=>{
        const {current,row}=await find(db,actor,id,true); if(!allows(current,'admin')) throw new ApiError(404,'NOT_FOUND');
        const contract=(await db.query(`SELECT * FROM soundpub.copyright_contracts WHERE registration_id=$1 FOR UPDATE`,[id])).rows[0];
        const next=String(input.status).toUpperCase();
        if(!contract || !contractTransitions[contract.status]?.includes(next)) throw new ApiError(409,'CONFLICT');
        const scope=`copyright-registration.contract-transition:${id}`;
        const replay=await claim(db,scope,idempotencyKey,input); if(replay) return replay;
        if(['GENERATED','STAMPED','SIGNED'].includes(next) && !input.media_object_id) throw new ApiError(400,'BAD_REQUEST');
        if (input.media_object_id) {
          const requiredType: Record<string,string> = { GENERATED:'CONTRACT_GENERATED', STAMPED:'CONTRACT_STAMPED', SIGNED:'CONTRACT_SIGNED' };
          const media = (await db.query<{ copyright_document_type: string }>(`SELECT m.copyright_document_type
            FROM soundpub.media_objects m JOIN soundpub.copyright_registration_files f ON f.media_object_id=m.id
            WHERE m.id=$1 AND m.resource_type='copyright_registration' AND m.resource_id=$2
              AND m.category='COPYRIGHT_REGISTRATION_DOCUMENT' AND m.status='ACTIVE' AND f.detached_at IS NULL`,
          [input.media_object_id,id])).rows[0];
          if (!media || media.copyright_document_type !== requiredType[next]) throw new ApiError(409,'CONFLICT');
        }
        let number=contract.contract_number as string|null;
        if(next==='GENERATED' && !number) {
          await db.query(`SELECT pg_advisory_xact_lock(hashtextextended('copyright-contract-number:'||to_char(clock_timestamp(),'YYYY-MM'),52))`);
          const sequence=Number((await db.query(`SELECT count(*)::int+1 AS value FROM soundpub.copyright_contracts
            WHERE created_at>=date_trunc('month',clock_timestamp()) AND created_at<date_trunc('month',clock_timestamp())+interval '1 month'`)).rows[0].value);
          const romans=['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII']; const now=new Date();
          number=`P${String(sequence).padStart(5,'0')}/Soundpub/${romans[now.getUTCMonth()]}/PBLSR/${now.getUTCFullYear()}`;
        }
        const media=input.media_object_id ?? null;
        const changed=await db.query(`UPDATE soundpub.copyright_contracts SET status=$3,contract_number=COALESCE($4,contract_number),
          generated_media_id=CASE WHEN $3='GENERATED' THEN COALESCE($5,generated_media_id) ELSE generated_media_id END,
          stamped_media_id=CASE WHEN $3='STAMPED' THEN COALESCE($5,stamped_media_id) ELSE stamped_media_id END,
          signed_media_id=CASE WHEN $3='SIGNED' THEN COALESCE($5,signed_media_id) ELSE signed_media_id END,
          stamp_provider=CASE WHEN $3='STAMPED' THEN COALESCE($6,stamp_provider) ELSE stamp_provider END,
          stamped_at=CASE WHEN $3='STAMPED' THEN clock_timestamp() ELSE stamped_at END,
          signed_at=CASE WHEN $3='SIGNED' THEN clock_timestamp() ELSE signed_at END,
          activated_at=CASE WHEN $3='ACTIVE' THEN clock_timestamp() ELSE activated_at END,
          void_reason=CASE WHEN $3='VOID' THEN $7 ELSE void_reason END,updated_at=clock_timestamp()
          WHERE registration_id=$1 AND version=$2 RETURNING id`,[id,input.version,next,number,media,input.stamp_provider ?? null,input.note ?? null]);
        if(changed.rowCount!==1) throw new ApiError(409,'CONFLICT');
        const registrationStatus:Record<string,string>={GENERATED:'CONTRACT_GENERATED',STAMPING_PENDING:'STAMPING_PENDING',STAMPED:'STAMPED',SIGNED:'CONTRACT_SIGNED',ACTIVE:'ACTIVE'};
        if(registrationStatus[next]) {
          await db.query(`UPDATE soundpub.copyright_registrations SET status=$2,updated_at=clock_timestamp() WHERE id=$1`,[id,registrationStatus[next]]);
          await history(db,id,String(row.status).toUpperCase(),registrationStatus[next],current.id,idempotencyKey,input.note ?? null);
        }
        if(next==='ACTIVE') await db.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at)
          VALUES ($1,'copyright',clock_timestamp()) ON CONFLICT (user_id,role,tenant_id) DO NOTHING`,[row.user_id]);
        await emit(db,current,'copyright_contract.transitioned',id,requestId,{from:contract.status,to:next,version:input.version+1},'copyright_contract.changed');
        const response=(await find(db,current,id)).row; await complete(db,scope,idempotencyKey,response); return response;
      });
    },
  };
}
export type CopyrightRegistrationsService = ReturnType<typeof createCopyrightRegistrationsService>;
