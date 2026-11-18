import { parsePhotoUrls } from './utils';

export const MAX_RECIPIENT_NAME_LENGTH = 120;

/**
 * Normalize optional POD recipient name: trim whitespace, bound length, and persist null when blank.
 */
export function normalizeRecipientName(rawName) {
  if (typeof rawName !== 'string') return null;
  const trimmed = rawName.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_RECIPIENT_NAME_LENGTH);
}

/**
 * Determine whether any POD proof (recipient name, signature, or photo) is present,
 * and whether submitting requires an explicit confirmation for empty proof.
 */
export function evaluatePodProof({ receivedBy, hasSignature, photoCount }) {
  const normalizedRecipient = normalizeRecipientName(receivedBy);
  const signaturePresent = Boolean(hasSignature);
  const photosPresent = Number(photoCount) > 0;
  const hasAnyProof = Boolean(normalizedRecipient || signaturePresent || photosPresent);

  return {
    normalizedRecipient,
    signaturePresent,
    photosPresent,
    hasAnyProof,
    requiresEmptyProofConfirmation: !hasAnyProof,
  };
}

/**
 * Inspect a persisted order record for rendering POD sections without broken images.
 */
export function extractOrderPodSummary(order) {
  const recipientName = normalizeRecipientName(order?.received_by);
  const signatureUrl =
    typeof order?.signature_url === 'string' && order.signature_url.trim()
      ? order.signature_url.trim()
      : null;
  const photoUrls = parsePhotoUrls(order?.photo_url);

  return {
    recipientName,
    signatureUrl,
    photoUrls,
    hasAnyPod: Boolean(recipientName || signatureUrl || photoUrls.length > 0),
  };
}
