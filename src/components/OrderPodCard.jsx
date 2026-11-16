import React from 'react';
import { PackageCheck, User } from 'lucide-react';
import { extractOrderPodSummary } from '../lib/podUtils';

/**
 * Shared Proof of Delivery display card for AdminOrders and MyOrders.
 * Renders recipient name, photos, and signature only when present; displays
 * neutral "Not provided" text instead of broken image tags or empty proof blocks.
 */
export default function OrderPodCard({ order }) {
  if (!order || !['delivered', 'delivered_partial'].includes(order.status)) {
    return null;
  }

  const { recipientName, signatureUrl, photoUrls, hasAnyPod } = extractOrderPodSummary(order);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
      <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider mb-2">
        <PackageCheck size={16} className="text-slate-400" /> Proof of Delivery
      </h4>

      {!hasAnyPod ? (
        <p className="text-xs font-medium text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-2.5">
          Not provided
        </p>
      ) : (
        <>
          {recipientName && (
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
                Received By
              </p>
              <p className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                <User size={14} className="text-emerald-500" /> {recipientName}
              </p>
            </div>
          )}

          {(photoUrls.length > 0 || signatureUrl) && (
            <div className="grid grid-cols-2 gap-3">
              {photoUrls.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    Photo{photoUrls.length > 1 ? `s (${photoUrls.length})` : ''}
                  </p>
                  <div className={`grid gap-2 ${photoUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {photoUrls.map((url, idx) => (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block relative group rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50"
                      >
                        <img
                          src={url}
                          alt={`Delivery Proof ${idx + 1}`}
                          className="w-full h-24 object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {signatureUrl && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    Signature
                  </p>
                  <a
                    href={signatureUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-xl overflow-hidden border border-slate-200 bg-white p-2 hover:border-slate-300 transition-colors shadow-sm"
                  >
                    <img
                      src={signatureUrl}
                      alt="Customer Signature"
                      className="w-full h-20 object-contain mix-blend-multiply"
                    />
                  </a>
                </div>
              )}
            </div>
          )}

          {(!recipientName || !signatureUrl) && (
            <p className="text-[11px] font-medium text-slate-400">
              {!recipientName && !signatureUrl
                ? 'Recipient name & signature: Not provided'
                : !recipientName
                ? 'Recipient name: Not provided'
                : 'Signature: Not provided'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
