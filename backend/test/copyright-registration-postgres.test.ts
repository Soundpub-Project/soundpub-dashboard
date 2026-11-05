import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createCopyrightRegistrationsService } from '../src/copyright-registrations/index.js';
import { webhookSignature } from '../src/integrations/webhook.js';
import { createMediaService, type MediaObjectStore } from '../src/media/index.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

const integration = process.env.RUN_DOCKER_TESTS === '1' ? test : test.skip;

integration('copyright registration draft, evidence, payment gate, review, and contract are atomic and scoped', async () => {
  const db = await concurrencyPostgres();
  try {
    const ownerId = randomUUID(), adminId = randomUUID();
    for (const [id,email,name] of [[ownerId,'copyright-owner@example.test','Copyright Owner'],[adminId,'admin@example.test','Admin']] as const) {
      await db.owner.query("INSERT INTO soundpub.backend_users(id,email,status,email_verified_at) VALUES ($1,$2,'active',now())",[id,email]);
      await db.owner.query('INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,$2)',[id,name]);
    }
    await db.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'user',now()),($2,'admin',now())",[ownerId,adminId]);
    const owner = { id: ownerId, status: 'active' as const, roles: ['user'] as const };
    const admin = { id: adminId, status: 'active' as const, roles: ['admin'] as const };
    const callbackSecret='copyright-registration-test-secret';
    const service = createCopyrightRegistrationsService(db.runtime,{environment:'test',callbackSecret});
    const store: MediaObjectStore = {
      bucket:'synthetic', key:id=>`media/objects/${id}`,
      async request(requesterId,value) { const id=randomUUID(); return { metadata:{ id,ownerId:requesterId,mimeType:value.mime_type,
        size:value.size,checksum:value.checksum,visibility:'private',createdAt:new Date().toISOString() },
      url:`http://localhost/${id}`,method:'PUT',headers:{} }; },
      async verify() {}, async download(row) { return `http://localhost/download/${row.id}`; }, async remove() {},
      async removeStaging() {}, async inspect() { return 'ok'; }, async listKeys() { return []; }, close() {}, async isReady() { return true; },
    };
    const media = createMediaService(db.runtime,store);
    const created = await service.create(owner,{ legal_name:'Pemohon Hak Cipta',email:'copyright-owner@example.test',
      phone:'081234567890',applicant_type:'personal' },'create-registration-1','request-create') as any;
    assert.equal(created.status,'draft');
    const draft = await service.replaceDraft(owner,created.id,{ version:created.version,legal_name:'Pemohon Hak Cipta',stage_name:null,
      nik:'1234567890123456',email:'copyright-owner@example.test',phone:'081234567890',address:'Jakarta',applicant_type:'personal',
      npwp:null,bank_name:'Bank Test',bank_account_number:'12345678',bank_account_name:'Pemohon Hak Cipta',works:[{
        title:'Karya Uji',alternate_title:null,composer_name:'Pemohon Hak Cipta',lyricist_name:null,ownership_percentage:100,
        is_collaboration:false,cowriters:[],release_status:'unreleased',release_date:null,isrc:null,upc:null,links:[],lyrics:null,notes:null,
      }] },'replace-draft-1','request-draft') as any;
    const upload = async (document_type:'IDENTITY'|'WORK_EVIDENCE',filename:string) => {
      const body=Buffer.from('%PDF-1.4 synthetic');
      const intent=await media.requestUpload(owner,{ category:'COPYRIGHT_REGISTRATION_DOCUMENT',resource_type:'copyright_registration',
        resource_id:created.id,document_type,mime_type:'application/pdf',size:body.length,
        checksum:createHash('sha256').update(body).digest('hex'),filename },`upload-${document_type}`);
      await media.completeUpload(owner,intent.object.id,`complete-${document_type}`);
    };
    await upload('IDENTITY','identity.pdf'); await upload('WORK_EVIDENCE','evidence.pdf');
    const submitted = await service.submit(owner,created.id,{ version:draft.version,declaration_accepted:true,
      declaration_version:'copyright-registration-terms-v1' },'submit-registration-1','request-submit') as any;
    assert.equal(submitted.status,'awaiting_payment');
    await assert.rejects(service.review(admin,created.id,{ version:submitted.version,status:'in_review' },'review-before-payment','request-review'),
      (error:any)=>error?.code==='CONFLICT');
    const invoice=await service.requestPaymentInvoice(owner,created.id,{},'invoice-request-1','request-invoice') as any;
    const rawBody=Buffer.from(JSON.stringify({provider_invoice_id:invoice.provider_invoice_id,status:'PAID',
      amount_minor:Math.round(Number(invoice.amount)*100),currency:invoice.currency}));
    const timestamp=String(Math.floor(Date.now()/1000)), eventId='copyright-payment-paid-1';
    const signature=webhookSignature(callbackSecret,{timestamp,eventId,rawBody});
    assert.equal(await service.paymentCallback({provider:'mock-copyright-registration',timestamp,eventId,signature,rawBody}),'accepted');
    assert.equal(await service.paymentCallback({provider:'mock-copyright-registration',timestamp,eventId,signature,rawBody}),'duplicate');
    const paid=await service.get(owner,created.id) as any;
    assert.equal(paid.status,'paid_pending_review');
    assert.equal(paid.payment.payment_status,'paid');
    let reviewed = await service.review(admin,created.id,{ version:paid.version,status:'in_review' },'review-paid-1','request-review-paid') as any;
    reviewed = await service.review(admin,created.id,{ version:reviewed.version,status:'approved',composer_code:'CMP001' },'approve-1','request-approve') as any;
    assert.equal(reviewed.status,'approved');
    const contractBytes=Buffer.from('%PDF-1.4 contract');
    const contractIntent=await media.requestUpload(admin,{ category:'COPYRIGHT_REGISTRATION_DOCUMENT',resource_type:'copyright_registration',
      resource_id:created.id,document_type:'CONTRACT_GENERATED',mime_type:'application/pdf',size:contractBytes.length,
      checksum:createHash('sha256').update(contractBytes).digest('hex'),filename:'contract.pdf' },'contract-upload');
    await media.completeUpload(admin,contractIntent.object.id,'contract-complete');
    const generated=await service.transitionContract(admin,created.id,{ version:reviewed.contract.version,status:'generated',
      media_object_id:contractIntent.object.id },'contract-generated-1','request-contract') as any;
    assert.equal(generated.status,'contract_generated');
    assert.match(generated.contract.contract_number,/^P\d{5}\/Soundpub\/[IVX]+\/PBLSR\/\d{4}$/);
    assert.equal((await db.owner.query("SELECT count(*)::int count FROM soundpub.outbox_events WHERE topic='copyright_registration.submitted'")).rows[0].count,1);
  } finally { await db.close(); }
});
