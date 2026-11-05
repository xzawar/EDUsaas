'use client';

import { Camera, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Modal, useAction } from '@/components/overlay';
import { Avatar, Button } from '@/components/ui';

const OUT = 320; // stored size (px): small on purpose, no high-resolution originals (spec §12.2)

/** Avatar with "change photo": choose → crop (drag + zoom) → save. Crop and resize happen in the browser. */
export function PhotoEditor({
  name,
  src,
  endpoint,
  canEdit,
}: {
  name: string;
  src: string | null;
  endpoint: string;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const { run, busy } = useAction();
  const VIEW = 260;

  // Draw the preview: the image covers the square, scaled by zoom and moved by the drag offset.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !img) return;
    const g = c.getContext('2d')!;
    const base = Math.max(VIEW / img.width, VIEW / img.height) * zoom;
    const w = img.width * base;
    const h = img.height * base;
    const x = Math.min(0, Math.max(VIEW - w, (VIEW - w) / 2 + offset.x));
    const y = Math.min(0, Math.max(VIEW - h, (VIEW - h) / 2 + offset.y));
    g.clearRect(0, 0, VIEW, VIEW);
    g.drawImage(img, x, y, w, h);
  }, [img, zoom, offset]);

  function choose(f: File) {
    setError(null);
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setError('Choose a JPEG, PNG or WebP photo.');
    if (f.size > 15 * 1024 * 1024) return setError('That photo is too large.');
    const url = URL.createObjectURL(f);
    const i = new Image();
    i.onload = () => {
      setImg(i);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setOpen(true);
    };
    i.onerror = () => setError('That file couldn’t be opened as a photo.');
    i.src = url;
  }

  async function save() {
    if (!canvas.current) return;
    const out = document.createElement('canvas');
    out.width = OUT;
    out.height = OUT;
    out.getContext('2d')!.drawImage(canvas.current, 0, 0, OUT, OUT);
    const data = out.toDataURL('image/jpeg', 0.85).split(',')[1]!;
    const r = await run(endpoint, { method: 'PUT', body: { data } }, 'Photo saved');
    if (r) setOpen(false);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Avatar name={name} src={src} size="lg" />
      {canEdit && (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => file.current?.click()}>
            <Camera className="size-3.5" /> {src ? 'Change' : 'Add photo'}
          </Button>
          {src && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => run(endpoint, { method: 'DELETE' }, 'Photo removed')}
              aria-label="Remove photo"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
          <input
            ref={file}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label={`Choose a photo of ${name}`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) choose(f);
              e.target.value = '';
            }}
          />
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Crop photo"
        description="Drag to position, use the slider to zoom. Only a small square copy is saved."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save photo'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-4">
          <canvas
            ref={canvas}
            width={VIEW}
            height={VIEW}
            className="cursor-grab touch-none rounded-full ring-4 ring-slate-100 active:cursor-grabbing"
            onPointerDown={(e) => {
              (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
            }}
            onPointerMove={(e) => {
              if (drag.current)
                setOffset({
                  x: drag.current.ox + e.clientX - drag.current.x,
                  y: drag.current.oy + e.clientY - drag.current.y,
                });
            }}
            onPointerUp={() => (drag.current = null)}
          />
          <label className="flex w-full items-center gap-3 text-sm text-slate-600">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1"
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}
