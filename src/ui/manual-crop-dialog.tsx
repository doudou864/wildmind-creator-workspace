'use client';
import { useRef, useState } from 'react';
import { Dialog, Button } from './components';
import { request } from './use-resource';
export function ManualCropDialog({
  crop,
  onClose,
  onSaved,
}: {
  crop: { id: string; width: number; height: number; ratio: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const scale = 10 ** Math.max(...crop.ratio.split(':').map((x) => (x.split('.')[1] ?? '').length));
  const ratio = crop.ratio.split(':').map((x) => Math.round(Number(x) * scale));
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const d = gcd(ratio[0], ratio[1]),
    rw = ratio[0] / d,
    rh = ratio[1] / d,
    max = Math.floor(Math.min(crop.width / rw, crop.height / rh));
  const [unit, setUnit] = useState(max),
    [offset, setOffset] = useState({ x: 0, y: 0 }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const surface = useRef<HTMLDivElement>(null),
    drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const width = rw * unit,
    height = rh * unit;
  return (
    <Dialog title={`选择 ${crop.ratio} 裁剪区域`} onClose={onClose}>
      <p>拖动框选择保留的画面，原图保留。</p>
      <div ref={surface} className="manual-crop-surface">
        <img src={`/api/images/crops/${encodeURIComponent(crop.id)}/file`} alt="等待裁剪的原图" />
        <div
          className="manual-crop-box"
          style={{
            left: `${(offset.x / crop.width) * 100}%`,
            top: `${(offset.y / crop.height) * 100}%`,
            width: `${(width / crop.width) * 100}%`,
            height: `${(height / crop.height) * 100}%`,
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          }}
          onPointerMove={(e) => {
            if (!drag.current || !surface.current) return;
            const factor = crop.width / surface.current.clientWidth;
            setOffset({
              x: Math.max(
                0,
                Math.min(crop.width - width, Math.round(drag.current.ox + (e.clientX - drag.current.x) * factor)),
              ),
              y: Math.max(
                0,
                Math.min(crop.height - height, Math.round(drag.current.oy + (e.clientY - drag.current.y) * factor)),
              ),
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
        />
      </div>
      <label>
        裁剪区域大小
        <input
          aria-label="裁剪区域大小"
          type="range"
          min={1}
          max={max}
          value={unit}
          onChange={(e) => {
            const next = Number(e.target.value);
            setUnit(next);
            setOffset({
              x: Math.min(offset.x, crop.width - rw * next),
              y: Math.min(offset.y, crop.height - rh * next),
            });
          }}
        />
      </label>
      <p>
        {width} × {height} 像素 · 人工裁剪
      </p>
      <Button
        variant="primary"
        disabled={busy || max < 1}
        onClick={async () => {
          setBusy(true);
          try {
            await request(`/api/images/crops/${crop.id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...offset, width, height }),
            });
            onSaved();
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        保存这个区域
      </Button>
      {error && <p role="alert">{error}</p>}
    </Dialog>
  );
}
