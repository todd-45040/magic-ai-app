import type { User } from '../types';

export type PartnerSource = 'ibm' | 'sam';
export type PartnerDetailType = 'ibm_ring' | 'sam_assembly';

export type PartnerTrialContext = {
  partnerSource: PartnerSource | null;
  partnerCampaign: string | null;
  partnerDetailType: PartnerDetailType | null;
  partnerDetailValue: string | null;
};

export function normalizePartnerSource(raw: any): PartnerSource | null {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'ibm' || value === 'sam') return value;
  return null;
}

export function getPartnerCampaign(partner_source: PartnerSource | null | undefined): string | null {
  if (source === 'ibm') return 'ibm-30day';
  if (source === 'sam') return 'sam-30day';
  return null;
}

export function getPartnerDetailType(partner_source: PartnerSource | null | undefined): PartnerDetailType | null {
  if (source === 'ibm') return 'ibm_ring';
  if (source === 'sam') return 'sam_assembly';
  return null;
}

export function getPartnerContext(user?: Partial<User> | null): PartnerTrialContext {
  const partnerSource = normalizePartnerSource(user?.partnerSource || user?.signupSource);
  const partnerCampaign = String(user?.partnerCampaign || getPartnerCampaign(partnerSource) || '').trim() || null;
  const partnerDetailType = (user?.partnerDetailType as PartnerDetailType | null | undefined) || getPartnerDetailType(partnerSource);

  const explicitDetailValue = String(user?.partnerDetailValue || '').trim();
  const fallbackDetailValue = partnerSource === 'ibm'
    ? String(user?.ibmRing || '').trim()
    : partnerSource === 'sam'
      ? String(user?.samAssembly || '').trim()
      : '';

  const partnerDetailValue = explicitDetailValue || fallbackDetailValue || null;

  return {
    partnerSource,
    partnerCampaign,
    partnerDetailType: partnerDetailType || null,
    partnerDetailValue,
  };
}

export function getPartnerMeta(user?: Partial<User> | null): Record<string, any> {
  const ctx = getPartnerContext(user);
  const meta: Record<string, any> = {};

  if (ctx.partnerSource) {
    meta.partner_source = ctx.partnerSource;
    meta.source = ctx.partnerSource;
  }
  if (ctx.partnerCampaign) {
    meta.partner_campaign = ctx.partnerCampaign;
    meta.campaign = ctx.partnerCampaign;
  }
  if (ctx.partnerDetailType) meta.partner_detail_type = ctx.partnerDetailType;
  if (ctx.partnerDetailValue) meta.partner_detail_value = ctx.partnerDetailValue;
  if (ctx.partnerDetailType === 'ibm_ring' && ctx.partnerDetailValue) meta.ibm_ring = ctx.partnerDetailValue;
  if (ctx.partnerDetailType === 'sam_assembly' && ctx.partnerDetailValue) meta.sam_assembly = ctx.partnerDetailValue;

  return meta;
}

export function isPartnerSource(raw: any): boolean {
  return normalizePartnerSource(raw) !== null;
}
