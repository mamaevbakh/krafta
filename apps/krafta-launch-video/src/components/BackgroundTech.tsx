import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

const sin01 = (x: number) => (Math.sin(x) + 1) / 2;

export const BackgroundTech: React.FC<{fadeOutOpacity?: number}> = ({fadeOutOpacity = 1}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;

  const breathe = interpolate(sin01(t * 0.55), [0, 1], [0.6, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      <AbsoluteFill
        style={{
          opacity: 0.95 * fadeOutOpacity,
          backgroundImage: [
            'radial-gradient(1100px 720px at 50% 42%, rgba(255,255,255,0.05), rgba(0,0,0,0) 62%)',
            'radial-gradient(900px 520px at 22% 22%, rgba(88,172,255,0.08), rgba(0,0,0,0) 58%)',
            'radial-gradient(900px 620px at 80% 76%, rgba(168,112,255,0.07), rgba(0,0,0,0) 60%)',
          ].join(','),
          filter: 'saturate(1.08)',
        }}
      />

      <AbsoluteFill
        style={{
          opacity: 0.22 * breathe * fadeOutOpacity,
          backgroundImage:
            'linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(120,200,255,0.08) 40%, rgba(180,120,255,0.07) 60%, rgba(0,0,0,0) 100%)',
          mixBlendMode: 'screen',
          transform: `translate3d(${Math.round((sin01(t * 0.18) - 0.5) * 60)}px, 0, 0)`,
        }}
      />

      <AbsoluteFill
        style={{
          opacity: 0.035 * fadeOutOpacity,
          mixBlendMode: 'soft-light',
          pointerEvents: 'none',
        }}
      >
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <filter id="grain-tech">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.95"
              numOctaves="3"
              stitchTiles="stitch"
              seed={Math.floor(frame / 2)}
            />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="table" tableValues="0 0.9" />
            </feComponentTransfer>
          </filter>
          <rect width="100" height="100" filter="url(#grain-tech)" opacity="0.55" />
        </svg>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          opacity: 0.8 * fadeOutOpacity,
          backgroundImage:
            'radial-gradient(1400px 900px at 50% 50%, rgba(0,0,0,0) 56%, rgba(0,0,0,0.84) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

