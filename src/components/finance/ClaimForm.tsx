'use client';

import { Camera } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FieldError, Modal, fieldErrors, useAction } from '@/components/overlay';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { MethodSelect, Money, MoneyInput, useClientKey } from '@/components/finance/shared';
import { periodLabel } from '@/lib/periods';

type Bill = { id: string; number: string; period: string; balancePaisa: number };

/** Shrinks a photo on the device so it fits the 300 KB limit, then returns base64 JPEG. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const max = 1280;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.8, 0.6, 0.45, 0.3]) {
      const data = canvas.toDataURL('image/jpeg', q).split(',')[1]!;
      if ((data.length * 3) / 4 <= 300 * 1024) return data;
    }
    throw new Error('too large');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ClaimButton({ bills, today }: { bills: Bill[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState(bills[0]?.id ?? '');
  const bill = bills.find((b) => b.id === invoiceId);
  const [amount, setAmount] = useState<number | null>(bills[0]?.balancePaisa ?? null);
  const [method, setMethod] = useState('JAZZCASH');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [proof, setProof] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileErr, setFileErr] = useState('');
  const { key, reset } = useClientKey();
  const { run, busy, error } = useAction();
  const errors = fieldErrors(error);
  if (!bills.length) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!proof || amount === null) return;
    const r = await run(
      '/me/fees/claims',
      { body: { invoiceId, amountPaisa: amount, method, reference, paidOn, clientKey: key, proof } },
      'Sent. The school office will check it.',
    );
    if (r) {
      setOpen(false);
      setProof(null);
      setPreview(null);
      setReference('');
      reset();
    }
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Camera className="size-4" /> I have paid
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Tell the school you paid"
        description="Paid by bank, JazzCash or Easypaisa? Send the details and a screenshot. The office confirms it and you get a receipt."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !proof || amount === null || reference.trim().length < 2} onClick={submit}>
              {busy ? 'Sending…' : 'Send proof'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          {error && !Object.keys(errors).length && <Alert>{error.message}</Alert>}
          <Field label="Which bill" htmlFor="cl-bill">
            <Select
              id="cl-bill"
              value={invoiceId}
              onChange={(e) => {
                setInvoiceId(e.target.value);
                setAmount(bills.find((b) => b.id === e.target.value)?.balancePaisa ?? null);
              }}
            >
              {bills.map((b) => (
                <option key={b.id} value={b.id}>
                  {periodLabel(b.period)} · {b.number}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Amount paid"
            htmlFor="cl-amount"
            hint={
              bill ? (
                <>
                  Balance on this bill: <Money paisa={bill.balancePaisa} />
                </>
              ) : undefined
            }
          >
            <MoneyInput id="cl-amount" valuePaisa={amount} onChange={setAmount} min={1} />
            <FieldError message={errors.amountPaisa} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Paid by" htmlFor="cl-method">
              <MethodSelect id="cl-method" value={method} onChange={setMethod} cashAllowed={false} />
            </Field>
            <Field label="Date" htmlFor="cl-date">
              <Input id="cl-date" type="date" max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </Field>
          </div>
          <Field label="Transaction ID" htmlFor="cl-ref">
            <Input
              id="cl-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="From your bank / wallet app"
            />
            <FieldError message={errors.reference} />
          </Field>
          <Field label="Screenshot of the payment" htmlFor="cl-file">
            <input
              id="cl-file"
              type="file"
              accept="image/*"
              capture="environment"
              className="block w-full text-sm"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                setFileErr('');
                setProof(null);
                setPreview(null);
                if (!f) return;
                try {
                  const data = await shrink(f);
                  setProof(data);
                  setPreview(`data:image/jpeg;base64,${data}`);
                } catch {
                  setFileErr('Could not read that image. Try another screenshot.');
                }
              }}
            />
            {fileErr && <p className="text-xs text-red-600">{fileErr}</p>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview && <img src={preview} alt="Preview" className="mt-2 max-h-40 rounded-lg ring-1 ring-slate-200" />}
          </Field>
        </form>
      </Modal>
    </>
  );
}
