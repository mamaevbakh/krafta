import React from 'react';
import {AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

import {BackgroundTech} from '../components/BackgroundTech';
import {typeStyles} from '../components/Type';
import {WindowFrame} from '../components/WindowFrame';
import {MockCatalogs} from '../demo/MockCatalogs';
import {MockDashboard} from '../demo/MockDashboard';
import {MockPayments} from '../demo/MockPayments';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const fade = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const Wordmark: React.FC<{opacity: number; scale: number; y: number; size: number}> = ({
  opacity,
  scale,
  y,
  size,
}) => {
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <div
        style={{
          opacity,
          transform: `translate3d(0, ${y}px, 0) scale(${scale})`,
          color: 'rgba(255,255,255,0.96)',
          ...typeStyles,
          fontWeight: 840,
          letterSpacing: '-0.06em',
          fontSize: size,
          lineHeight: 0.92,
          textShadow: '0 0 70px rgba(120,200,255,0.06), 0 0 130px rgba(168,112,255,0.04)',
        }}
      >
        Krafta
      </div>
    </AbsoluteFill>
  );
};

const DemoShot: React.FC<{
  title: string;
  from: number;
  duration: number;
  children: React.ReactNode;
  index: number;
  totalShots: number;
}> = ({title, from, duration, children, index, totalShots}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const local = frame - from;

  const inFrames = Math.round(0.55 * fps);
  const outFrames = Math.round(0.55 * fps);

  const inOpacity = fade(local + 1, 0, inFrames);
  const outOpacity = 1 - fade(local, duration - outFrames, duration);
  const opacity = inOpacity * outOpacity;

  const p = spring({
    frame: local,
    fps,
    config: {damping: 200},
    durationInFrames: Math.round(1.0 * fps),
  });

  const q = spring({
    frame: local - (duration - Math.round(0.8 * fps)),
    fps,
    config: {damping: 200},
    durationInFrames: Math.round(0.9 * fps),
  });

  const enterX = lerp(80, 0, p);
  const exitX = lerp(0, -90, clamp(q, 0, 1));
  const x = enterX + exitX;

  const baseScale = lerp(0.955, 1, p);
  const exitScale = lerp(1, 0.985, clamp(q, 0, 1));
  const scale = baseScale * exitScale;

  const baseRotate = lerp(index % 2 === 0 ? -2.2 : 2.2, 0, p);
  const rotate = baseRotate + lerp(0, index % 2 === 0 ? -1.4 : 1.4, clamp(q, 0, 1));

  const frameW = Math.round(width * 0.78);
  const frameH = Math.round(height * 0.74);

  const titleOpacity = opacity * 0.85;
  const titleY = lerp(10, 0, fade(local, 0, inFrames));

  const accent = interpolate(index / Math.max(1, totalShots - 1), [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{opacity}}>
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          transform: `translate3d(${Math.round(x)}px, 0, 0)`,
        }}
      >
        <div
          style={{
            position: 'relative',
            transform: `perspective(1400px) rotateX(2deg) rotateY(${rotate}deg) scale(${scale})`,
          }}
        >
          <WindowFrame title={title} width={frameW} height={frameH}>
            {children}
          </WindowFrame>

          <div
            style={{
              position: 'absolute',
              inset: -2,
              borderRadius: 28,
              pointerEvents: 'none',
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.00) 40%, rgba(0,0,0,0.25) 100%)',
              mixBlendMode: 'screen',
              opacity: 0.45,
            }}
          />

          <div
            style={{
              position: 'absolute',
              inset: -80,
              pointerEvents: 'none',
              background: `radial-gradient(540px 260px at 30% 20%, rgba(88,172,255,${0.18 + accent * 0.06}), rgba(0,0,0,0) 60%),
                radial-gradient(540px 260px at 74% 30%, rgba(168,112,255,${0.14 + (1 - accent) * 0.06}), rgba(0,0,0,0) 62%)`,
              filter: 'blur(30px)',
              opacity: 0.5,
              mixBlendMode: 'screen',
            }}
          />
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{justifyContent: 'flex-start', alignItems: 'center', paddingTop: 64}}>
        <div
          style={{
            opacity: titleOpacity,
            transform: `translate3d(0, ${titleY}px, 0)`,
            ...typeStyles,
            fontSize: 16,
            fontWeight: 560,
            color: 'rgba(255,255,255,0.58)',
            letterSpacing: '-0.01em',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const KraftaDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width, durationInFrames} = useVideoConfig();

  const safeDuration = durationInFrames ?? 30 * fps;
  const endFade = 1 - fade(frame, safeDuration - Math.round(2.6 * fps), safeDuration);

  const introDur = 3 * fps;
  const shotDur = 7 * fps;
  const gap = Math.round(0.5 * fps);

  const s1 = introDur;
  const s2 = s1 + shotDur - gap;
  const s3 = s2 + shotDur - gap;
  const outroFrom = s3 + shotDur - gap;

  const introIn = fade(frame, 0, Math.round(0.8 * fps));
  const introHoldOut = 1 - fade(frame, introDur - Math.round(0.8 * fps), introDur);
  const introOpacity = introIn * introHoldOut;

  const introScale = lerp(0.985, 1, fade(frame, 0, Math.round(1.4 * fps)));

  const outroLocal = frame - outroFrom;
  const outroOpacity = fade(outroLocal, 0, Math.round(1.0 * fps));
  const outroScale = lerp(1.01, 1, fade(outroLocal, 0, Math.round(1.8 * fps)));

  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      <BackgroundTech fadeOutOpacity={endFade} />

      <Sequence from={0} durationInFrames={introDur}>
        <Wordmark
          opacity={introOpacity * endFade}
          scale={introScale}
          y={0}
          size={clamp(Math.round(width * 0.18), 220, 360)}
        />
        <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
          <div
            style={{
              marginTop: 220,
              opacity: introOpacity * 0.75 * endFade,
              ...typeStyles,
              fontSize: 22,
              fontWeight: 520,
              color: 'rgba(255,255,255,0.56)',
              letterSpacing: '-0.02em',
            }}
          >
            Commerce, end-to-end.
          </div>
        </AbsoluteFill>
      </Sequence>

      <Sequence from={s1} durationInFrames={shotDur}>
        <DemoShot title="Dashboard" from={s1} duration={shotDur} index={0} totalShots={3}>
          <MockDashboard />
        </DemoShot>
      </Sequence>

      <Sequence from={s2} durationInFrames={shotDur}>
        <DemoShot title="Catalogs" from={s2} duration={shotDur} index={1} totalShots={3}>
          <MockCatalogs />
        </DemoShot>
      </Sequence>

      <Sequence from={s3} durationInFrames={shotDur}>
        <DemoShot title="Payments" from={s3} duration={shotDur} index={2} totalShots={3}>
          <MockPayments />
        </DemoShot>
      </Sequence>

      <Sequence from={outroFrom} durationInFrames={safeDuration - outroFrom}>
        <Wordmark
          opacity={outroOpacity * endFade}
          scale={outroScale}
          y={0}
          size={clamp(Math.round(width * 0.22), 260, 420)}
        />
        <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
          <div
            style={{
              marginTop: 240,
              opacity: outroOpacity * 0.7 * endFade,
              ...typeStyles,
              fontSize: 22,
              fontWeight: 520,
              color: 'rgba(255,255,255,0.54)',
              letterSpacing: '-0.02em',
            }}
          >
            Infrastructure for commerce
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
