'use client';
import { useEffect, useState } from 'react';
export function AssetImage({
  src,
  alt,
  className,
  width,
  height,
  onLoad,
}: {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  onLoad?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return failed ? (
    <span className={`asset-image-error ${className ?? ''}`} role="img" aria-label={alt}>
      图片暂时无法读取
    </span>
  ) : (
    <img
      src={src}
      alt={alt}
      className={className}
      width={width}
      height={height}
      onLoad={onLoad}
      onError={() => setFailed(true)}
    />
  );
}
