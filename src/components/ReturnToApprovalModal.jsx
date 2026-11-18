import React, { useState } from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MAX_RETURN_REASON_LENGTH } from '../lib/orderApprovalUtils';

/**
 * Shared confirmation dialog for returning a pre-dispatch order back to Pending approval.
 */
export default function ReturnToApprovalModal({
  open,
  order,
  isPending = false,
  onClose,
  onConfirm,
}) {
  const [reasonEntry, setReasonEntry] = useState({ orderId: null, text: '' });

  const currentOrderKey = open ? (order?.id || 'active') : null;
  const reason = reasonEntry.orderId === currentOrderKey ? reasonEntry.text : '';
  const trimmedReason = reason.trim();
  const shortId = order?.id ? order.id.substring(0, 8).toUpperCase() : '';
  const hasAssignedDriver = Boolean(order?.driver_name || order?.assigned_driver_id);

  const handleClose = () => {
    setReasonEntry({ orderId: null, text: '' });
    onClose();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!trimmedReason || isPending) return;
    onConfirm(trimmedReason);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !isPending && handleClose()}>
      <DialogContent className="sm:max-w-md p-6 sm:p-8">
        <DialogHeader>
          <div className="w-14 h-14 bg-amber-50 text-amber-600 border border-amber-200 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
            <RotateCcw size={26} />
          </div>
          <DialogTitle className="text-xl font-bold text-slate-900 text-center">
            Send Back to Approval?
          </DialogTitle>
          <DialogDescription className="text-center text-slate-600 text-sm mt-1">
            Return <span className="font-mono font-bold text-slate-900">#{shortId}</span> to Pending approval so items or order notes can be edited without cancelling or recreating the order.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-left">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-1 leading-relaxed">
              <p className="font-bold">Re-check packed items warning:</p>
              <p>
                Warehouse staff must physically re-check any already packed items after re-approval. Inventory reservations remain unchanged until individual items are modified.
              </p>
              {hasAssignedDriver && (
                <p className="font-medium text-amber-800">
                  Existing pre-dispatch driver/vehicle assignment will be cleared and preserved in the audit log.
                </p>
              )}
            </div>
          </div>

          <div className="text-left">
            <label
              htmlFor="return-to-approval-reason"
              className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block"
            >
              Reason for Returning <span className="text-red-500">*</span>
            </label>
            <textarea
              id="return-to-approval-reason"
              value={reason}
              onChange={(e) => setReasonEntry({ orderId: currentOrderKey, text: e.target.value })}
              maxLength={MAX_RETURN_REASON_LENGTH}
              required
              disabled={isPending}
              placeholder="e.g., Customer requested quantity update before dispatch..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none resize-none h-24"
            />
            <p className="text-[11px] text-slate-400 mt-1 text-right">
              {reason.length}/{MAX_RETURN_REASON_LENGTH}
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 py-5"
              disabled={isPending}
              onClick={handleClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 py-5 bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!trimmedReason || isPending}
            >
              {isPending ? 'Returning...' : 'Confirm Return'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
