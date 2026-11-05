import assert from 'node:assert/strict';
import test from 'node:test';
import {
  copyrightApplicantType, copyrightContractTransition, copyrightRegistrationCreateDraft,
  copyrightRegistrationDraftReplace, copyrightRegistrationListQuery, copyrightRegistrationReviewTransition,
  copyrightRegistrationSubmit, copyrightWorkInput,
} from '../src/copyright-registrations/contracts.js';

const work = {
  title: 'Karya Satu', alternate_title: null, composer_name: 'Komposer', lyricist_name: null,
  ownership_percentage: 100, is_collaboration: false, cowriters: [], release_status: 'unreleased' as const,
  release_date: null, isrc: null, upc: null, links: [], lyrics: null, notes: null,
};
const draft = {
  version: 1, legal_name: 'Pemohon', stage_name: null, nik: '1234567890123456', email: 'owner@example.test',
  phone: '08123456789', address: 'Alamat pemohon', applicant_type: 'personal' as const, npwp: null,
  bank_name: 'Bank', bank_account_number: '12345678', bank_account_name: 'Pemohon', works: [work],
};

test('applicant types are canonical and all input objects are strict', () => {
  for (const value of ['personal', 'band_representative', 'company_label']) assert.equal(copyrightApplicantType.parse(value), value);
  for (const legacy of ['company', 'label', 'representative']) assert.equal(copyrightApplicantType.safeParse(legacy).success, false);
  assert.equal(copyrightRegistrationCreateDraft.safeParse({
    legal_name: 'Pemohon', email: 'owner@example.test', phone: null, applicant_type: 'personal', user_id: crypto.randomUUID(),
  }).success, false);
  assert.equal(copyrightRegistrationCreateDraft.safeParse({
    legal_name: 'Pemohon', email: 'owner@example.test', phone: '08123456789', applicant_type: 'personal',
  }).success, true);
  assert.equal(copyrightRegistrationDraftReplace.safeParse({ ...draft, status: 'draft' }).success, false);
});

test('atomic draft replace validates identity, bank and complete work invariants', () => {
  assert.equal(copyrightRegistrationDraftReplace.safeParse(draft).success, true);
  assert.equal(copyrightRegistrationDraftReplace.safeParse({ ...draft, version: 0 }).success, false);
  assert.equal(copyrightRegistrationDraftReplace.safeParse({ ...draft, nik: '123' }).success, false);
  assert.equal(copyrightRegistrationDraftReplace.safeParse({ ...draft, works: [work, { ...work, title: 'karya satu' }] }).success, false);
  assert.equal(copyrightWorkInput.safeParse({ ...work, release_status: 'released', release_date: null }).success, false);
  assert.equal(copyrightWorkInput.safeParse({ ...work, is_collaboration: true }).success, false);
  assert.equal(copyrightWorkInput.safeParse({ ...work, is_collaboration: true,
    ownership_percentage: 70, cowriters: [{ name: 'Co-writer', ownership_percentage: 30 }] }).success, true);
  assert.equal(copyrightWorkInput.safeParse({ ...work, is_collaboration: true,
    ownership_percentage: 80, cowriters: [{ name: 'Co-writer', ownership_percentage: 30 }] }).success, false);
});

test('submit, list and admin transitions reject authority and lifecycle ambiguity', () => {
  assert.equal(copyrightRegistrationSubmit.safeParse({ version: 2, declaration_accepted: true,
    declaration_version: 'copyright-registration-terms-v1' }).success, true);
  assert.equal(copyrightRegistrationSubmit.safeParse({ version: 2, declaration_accepted: false,
    declaration_version: 'v1' }).success, false);
  assert.equal(copyrightRegistrationListQuery.safeParse({ limit: '100', status: 'in_review', applicant_type: 'company_label',
    payment_status: 'paid', search: 'pemohon' }).success, true);
  assert.equal(copyrightRegistrationListQuery.safeParse({ limit: '101' }).success, false);
  assert.equal(copyrightRegistrationReviewTransition.safeParse({ version: 1, status: 'revision_requested', note: null }).success, false);
  assert.equal(copyrightRegistrationReviewTransition.safeParse({ version: 1, status: 'rejected', note: 'Bukti tidak sah' }).success, true);
  assert.equal(copyrightRegistrationReviewTransition.safeParse({ version: 1, status: 'in_review', composer_code: 'CMP001' }).success, false);
});

test('contract transitions require stamped media and void evidence', () => {
  assert.equal(copyrightContractTransition.safeParse({ version: 1, status: 'generated' }).success, false);
  assert.equal(copyrightContractTransition.safeParse({ version: 1, status: 'generated', media_object_id: crypto.randomUUID() }).success, true);
  assert.equal(copyrightContractTransition.safeParse({ version: 1, status: 'stamped' }).success, false);
  assert.equal(copyrightContractTransition.safeParse({ version: 1, status: 'stamped', media_object_id: crypto.randomUUID() }).success, true);
  assert.equal(copyrightContractTransition.safeParse({ version: 1, status: 'void', note: null }).success, false);
  assert.equal(copyrightContractTransition.safeParse({ version: 1, status: 'void', note: 'Kontrak diganti' }).success, true);
});
