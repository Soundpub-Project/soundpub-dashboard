import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import Fastify from 'fastify';
import { createMediaObjectStore, createMediaService, type MediaObjectStore } from '../src/media/index.js';
import { registerMediaRoutes } from '../src/api/media.js';
import { ApiError } from '../src/api/types.js';
import { concurrencyPostgres, dockerTestsEnabled, testComposeResource } from './support/concurrency-postgres.js';

test('live synthetic HTTP API + disposable PostgreSQL/RustFS signed lifecycle and CORS', { skip: !dockerTestsEnabled }, async t => {
  const database = await concurrencyPostgres();
  t.after(() => database.close());
  const accessKeyId = `synthetic${randomUUID().replaceAll('-','').slice(0,12)}`;
  const secretAccessKey = randomUUID();
  let store: MediaObjectStore | undefined;
  const app = Fastify();
  try {
    const resource = testComposeResource('test-rustfs', { RUSTFS_ACCESS_KEY: accessKeyId, RUSTFS_SECRET_KEY: secretAccessKey });
    t.after(() => resource.close());
    const port = Number(resource.start().split(':')[1]);
    const endpoint = `http://127.0.0.1:${port}`;
    const deadline = Date.now()+45000;
    for (;;) {
      try { if ((await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(1000) })).ok) break; } catch { /* RustFS may still be starting; retry until deadline. */ }
      if (Date.now()>deadline) throw new Error('Disposable RustFS readiness timeout');
      await setTimeout(200);
    }
    store = await createMediaObjectStore(database.runtime,{ environment:'test',endpoint,publicEndpoint:endpoint,
      credentials:{accessKeyId,secretAccessKey},bucket:'soundpub-synthetic-media',prefix:'media' });
    assert.equal(await store.isReady(),true);
    const actorId = randomUUID();
    const labelId = randomUUID();
    const releaseId = randomUUID();
    const trackId = randomUUID();
    await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')",[actorId]);
    await database.owner.query("INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,'Synthetic')",[actorId]);
    await database.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'artist',now())",[actorId]);
    await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')",[labelId]);
    await database.owner.query("INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,'Synthetic label')",[labelId]);
    await database.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'label',now())",[labelId]);
    await database.owner.query('UPDATE soundpub.profiles SET parent_label_id=$1 WHERE id=$2',[labelId,actorId]);
    await database.owner.query("INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at) VALUES ($2,$1,'Synthetic',now())",[actorId,labelId]);
    await database.owner.query("INSERT INTO soundpub.releases(id,label_id,artist_user_id,title,artist_name) VALUES ($1,$3,$2,'Synthetic','Synthetic')",[releaseId,actorId,labelId]);
    await database.owner.query("INSERT INTO soundpub.tracks(id,release_id,title,artist_name,position) VALUES ($1,$2,'Synthetic','Synthetic',1)",[trackId,releaseId]);
    const actor = { id:actorId,roles:['artist'] as const,status:'active' as const };
    const media = createMediaService(database.runtime,store);
    app.setErrorHandler((error,_request,reply)=>reply.code(error instanceof ApiError ? error.statusCode : (error as {statusCode?:number}).statusCode ?? 500).send({code:error instanceof ApiError ? error.code : 'INTERNAL_ERROR'}));
    registerMediaRoutes(app,media,async request=>{
      if(request.headers.authorization!=='Bearer synthetic') throw new ApiError(401,'UNAUTHORIZED');
      return actor;
    });
    const address = await app.listen({host:'127.0.0.1',port:0});
    const bytes = Buffer.alloc(44); bytes.write('RIFF');bytes.writeUInt32LE(36,4);bytes.write('WAVE',8);bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(44100,24);bytes.writeUInt32LE(88200,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);
    const headers = {authorization:'Bearer synthetic','content-type':'application/json'};
    const upload = await fetch(`${address}/api/v1/storage/uploads`,{method:'POST',headers,body:JSON.stringify({
      category:'TRACK_AUDIO',resource_type:'track',resource_id:trackId,mime_type:'audio/wav',filename:'synthetic.wav',
      size:bytes.length,checksum:createHash('sha256').update(bytes).digest('hex'),
    })});
    assert.equal(upload.status,200,await upload.clone().text());
    const intent = await upload.json() as {object:{id:string};url:string;headers:Record<string,string>};
    const origin = 'http://127.0.0.1:8281';
    const cors = await fetch(intent.url,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'PUT',
      'Access-Control-Request-Headers':'content-type,x-amz-checksum-sha256'}});
    assert.ok(cors.ok,await cors.text()); assert.equal(cors.headers.get('access-control-allow-origin'),origin);
    const missing = await fetch(`${address}/api/v1/storage/uploads/${intent.object.id}/complete`,{method:'POST',headers,body:'{}'});
    assert.equal(missing.status,409);
    const put = await fetch(intent.url,{method:'PUT',headers:{...intent.headers,Origin:origin},body:bytes});
    assert.ok(put.ok,await put.text()); assert.equal(put.headers.get('access-control-allow-origin'),origin);
    const completed = await fetch(`${address}/api/v1/storage/uploads/${intent.object.id}/complete`,{method:'POST',headers,body:'{}'});
    assert.equal(completed.status,200,await completed.clone().text());
    assert.equal((await completed.json() as {status:string}).status,'ACTIVE');
    const direct = await fetch(`${endpoint}/soundpub-synthetic-media/media/objects/${intent.object.id}`);
    assert.equal(direct.status,403);
    const signed = await fetch(`${address}/api/v1/storage/objects/${intent.object.id}/download`,{headers});
    assert.equal(signed.status,200,await signed.clone().text());
    const capability = await signed.json() as {url:string};
    const download = await fetch(capability.url);
    assert.ok(download.ok); assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
    const tampered = new URL(capability.url);tampered.searchParams.set('X-Amz-Signature','0'.repeat(64));
    assert.equal((await fetch(tampered)).status,403);
    // Replayed staging upload leaves final immutable snapshot unchanged.
    assert.ok((await fetch(intent.url,{method:'PUT',headers:intent.headers,body:bytes})).ok);
    assert.deepEqual(Buffer.from(await (await fetch(capability.url)).arrayBuffer()),bytes);
    const signer = new S3Client({endpoint,region:'us-east-1',credentials:{accessKeyId,secretAccessKey},forcePathStyle:true});
    try {
      const expired = await getSignedUrl(signer,new GetObjectCommand({Bucket:store.bucket,Key:store.key(intent.object.id)}),
        {expiresIn:1,signingDate:new Date(Date.now()-120000)});
      assert.equal((await fetch(expired)).status,403);
    } finally { signer.destroy(); }
    const badBytes = Buffer.alloc(24,65);
    const badIntentResponse = await fetch(`${address}/api/v1/storage/uploads`,{method:'POST',headers,body:JSON.stringify({
      category:'USER_AVATAR',resource_type:'user',resource_id:actorId,mime_type:'image/png',filename:'spoof.png',
      size:badBytes.length,checksum:createHash('sha256').update(badBytes).digest('hex'),
    })});
    assert.equal(badIntentResponse.status,200);
    const badIntent = await badIntentResponse.json() as typeof intent;
    assert.ok((await fetch(badIntent.url,{method:'PUT',headers:badIntent.headers,body:badBytes})).ok);
    const rejected = await fetch(`${address}/api/v1/storage/uploads/${badIntent.object.id}/complete`,{method:'POST',headers,body:'{}'});
    assert.equal(rejected.status,400);
    assert.equal((await database.owner.query('SELECT status FROM soundpub.media_objects WHERE id=$1',[badIntent.object.id])).rows[0].status,'FAILED');
    assert.equal((await database.owner.query('SELECT avatar_media_id FROM soundpub.profiles WHERE id=$1',[actorId])).rows[0].avatar_media_id,null);
    assert.equal((await media.reconcile()).issues.length,0);
    const deleted = await fetch(`${address}/api/v1/storage/objects/${intent.object.id}`,{method:'DELETE',headers,body:'{}'});
    assert.equal(deleted.status,200);
    assert.equal((await fetch(`${address}/api/v1/storage/objects/${intent.object.id}/download`,{headers})).status,404);
    await database.owner.query("UPDATE soundpub.media_objects SET expires_at=now()-interval '10 minutes',cleanup_after=now()-interval '1 minute'");
    assert.equal((await media.cleanup()).deleted,2);
    assert.ok([403,404].includes((await fetch(capability.url)).status));
  } finally {
    try { await app.close(); } finally { store?.close(); }
  }
});


