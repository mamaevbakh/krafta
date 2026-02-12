import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const fade = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

const sin01 = (x: number) => (Math.sin(x) + 1) / 2;

type CardSpec = {
  left: number;
  top: number;
  width: number;
  height: number;
  rotate: number;
  blur: number;
  opacityBase: number;
  driftX: number;
  driftY: number;
  hue: 'ice' | 'violet' | 'neutral';
};

const cardGradient = (hue: CardSpec['hue']) => {
  if (hue === 'ice') {
    return 'linear-gradient(135deg, rgba(120,200,255,0.16), rgba(255,255,255,0.03), rgba(80,140,255,0.10))';
  }
  if (hue === 'violet') {
    return 'linear-gradient(135deg, rgba(190,120,255,0.14), rgba(255,255,255,0.03), rgba(120,120,255,0.10))';
  }
  return 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02), rgba(255,255,255,0.04))';
};

const Grain: React.FC<{opacity: number; seed: number}> = ({opacity, seed}) => {
  return (
    <AbsoluteFill
      style={{
        opacity,
        mixBlendMode: 'soft-light',
        pointerEvents: 'none',
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <filter id="grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="3"
            stitchTiles="stitch"
            seed={seed}
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 0.8" />
          </feComponentTransfer>
        </filter>
        <rect width="100" height="100" filter="url(#grain)" opacity="0.55" />
      </svg>
    </AbsoluteFill>
  );
};

const CenterText: React.FC<{
  text: string;
  opacity: number;
  fontSize: number;
  fontWeight: number;
  y: number;
  color: string;
  blurPx?: number;
  scale?: number;
  letterSpacing?: string;
}> = ({text, opacity, fontSize, fontWeight, y, color, blurPx = 0, scale = 1, letterSpacing = '-0.02em'}) => {
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <div
        style={{
          opacity,
          transform: `translate3d(0, ${y}px, 0) scale(${scale})`,
          filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
          color,
          textAlign: 'center',
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif",
          fontWeight,
          letterSpacing,
          fontSize,
          lineHeight: 1.05,
          whiteSpace: 'pre-line',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

export const KraftaLaunch: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width, height, durationInFrames} = useVideoConfig();

  const t = frame / fps;

  const totalExpected = 30 * fps;
  const safeDuration = durationInFrames ?? totalExpected;
  const fadeOutStart = Math.max(0, safeDuration - Math.round(2.5 * fps));

  const globalOpacity = 1;
  const endFade = 1 - fade(frame, fadeOutStart, safeDuration);

  const sceneArrival = {from: 0, dur: 4 * fps};
  const sceneContext = {from: 4 * fps, dur: 5 * fps};
  const sceneTension = {from: 9 * fps, dur: 4 * fps};
  const sceneReveal = {from: 13 * fps, dur: 5 * fps};
  const sceneDefinition = {from: 18 * fps, dur: 5 * fps};

  const shapesIn = fade(frame, sceneContext.from + Math.round(0.3 * fps), sceneContext.from + Math.round(1.8 * fps));
  const backdropIn = fade(frame, sceneContext.from, sceneContext.from + Math.round(1.6 * fps));
  const darken = fade(frame, sceneTension.from, sceneTension.from + Math.round(1.2 * fps));
  const motionSlow = 1 - fade(frame, sceneTension.from, sceneTension.from + Math.round(1.8 * fps)) * 0.7;
  const motionFactor = clamp(motionSlow, 0.3, 1);

  const logoIn = fade(frame, sceneReveal.from, sceneReveal.from + Math.round(2.2 * fps));
  const logoScale = lerp(0.97, 1, fade(frame, sceneReveal.from, sceneReveal.from + Math.round(2.6 * fps)));
  const logoBlurPx = lerp(10, 0, logoIn);

  const glowBreath = lerp(0.55, 1, sin01(t * 0.45));

  const logoSize = clamp(Math.round(width * 0.29), 420, 720);

  const cards = useMemo<CardSpec[]>(
    () => [
      {
        left: 0.12,
        top: 0.64,
        width: 0.34,
        height: 0.32,
        rotate: -10,
        blur: 52,
        opacityBase: 0.16,
        driftX: 14,
        driftY: -9,
        hue: 'ice',
      },
      {
        left: 0.62,
        top: 0.18,
        width: 0.32,
        height: 0.28,
        rotate: 14,
        blur: 60,
        opacityBase: 0.14,
        driftX: -10,
        driftY: 12,
        hue: 'violet',
      },
      {
        left: 0.58,
        top: 0.70,
        width: 0.28,
        height: 0.22,
        rotate: 6,
        blur: 46,
        opacityBase: 0.12,
        driftX: -8,
        driftY: -7,
        hue: 'neutral',
      },
      {
        left: 0.18,
        top: 0.10,
        width: 0.22,
        height: 0.18,
        rotate: -4,
        blur: 44,
        opacityBase: 0.1,
        driftX: 8,
        driftY: 10,
        hue: 'neutral',
      },
    ],
    []
  );

  const arrivalLocal = frame - sceneArrival.from;
  const arrivalIn = fade(arrivalLocal, 0, Math.round(1.2 * fps));
  const arrivalOut = 1 - fade(arrivalLocal, Math.round(2.7 * fps), sceneArrival.dur);
  const arrivalOpacity = arrivalIn * arrivalOut;

  const contextLocal = frame - sceneContext.from;
  const wordSlot = Math.floor(clamp(contextLocal, 0, sceneContext.dur - 1) / Math.round((5 * fps) / 3));

  const contextWord = (index: number) => {
    const slotDur = Math.round((5 * fps) / 3);
    const local = contextLocal - index * slotDur;
    const inFrames = Math.round(0.6 * fps);
    const outFrames = Math.round(0.6 * fps);
    const inOp = fade(local + 1, 0, inFrames);
    const outOp = 1 - fade(local, slotDur - outFrames, slotDur);
    const y = lerp(8, 0, fade(local, 0, slotDur));
    return {opacity: inOp * outOp, y};
  };

  const context0 = contextWord(0);
  const context1 = contextWord(1);
  const context2 = contextWord(2);

  const tensionLocal = frame - sceneTension.from;
  const tensionOpacity = fade(tensionLocal, Math.round(0.2 * fps), Math.round(0.9 * fps));
  const tensionScale = lerp(0.98, 1, fade(tensionLocal, 0, sceneTension.dur));

  const tensionFadeDuringReveal = 1 - fade(frame, sceneReveal.from, sceneReveal.from + Math.round(0.9 * fps));

  const definitionLocal = frame - sceneDefinition.from;
  const definitionOpacity = fade(definitionLocal, Math.round(0.2 * fps), Math.round(1.2 * fps));

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#000',
        overflow: 'hidden',
      }}
    >
      <AbsoluteFill
        style={{
          opacity: globalOpacity * backdropIn * endFade,
          backgroundImage: [
            'radial-gradient(1000px 650px at 50% 48%, rgba(255,255,255,0.035), rgba(0,0,0,0) 60%)',
            'radial-gradient(900px 550px at 18% 18%, rgba(120,200,255,0.045), rgba(0,0,0,0) 55%)',
            'radial-gradient(900px 600px at 82% 76%, rgba(180,120,255,0.035), rgba(0,0,0,0) 58%)',
          ].join(','),
        }}
      />

      <AbsoluteFill
        style={{
          opacity: globalOpacity * shapesIn * endFade,
        }}
      >
        {cards.map((c, i) => {
          const driftPhase = (i + 1) * 0.9;
          const drift = sin01(t * 0.22 * motionFactor + driftPhase);
          const x = lerp(-c.driftX, c.driftX, drift) * motionFactor;
          const y = lerp(-c.driftY, c.driftY, sin01(t * 0.19 * motionFactor + driftPhase * 1.3)) * motionFactor;
          const opacity = c.opacityBase * lerp(1, 0.65, darken);

          return (
            <div
              key={`${c.left}-${c.top}-${i}`}
              style={{
                position: 'absolute',
                left: Math.round(c.left * width),
                top: Math.round(c.top * height),
                width: Math.round(c.width * width),
                height: Math.round(c.height * height),
                borderRadius: 28,
                backgroundImage: cardGradient(c.hue),
                filter: `blur(${c.blur}px)`,
                opacity,
                transform: `translate3d(${x}px, ${y}px, 0) rotate(${c.rotate}deg)`,
                mixBlendMode: 'screen',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.03) inset',
              }}
            />
          );
        })}
      </AbsoluteFill>

      <Grain opacity={0.035 * endFade} seed={Math.floor(frame / 2)} />

      <AbsoluteFill style={{opacity: endFade}}>
        {frame >= sceneArrival.from && frame < sceneArrival.from + sceneArrival.dur ? (
          <CenterText
            text="A new way to build"
            opacity={arrivalOpacity}
            fontSize={44}
            fontWeight={500}
            y={0}
            color="rgba(255,255,255,0.42)"
            letterSpacing="-0.02em"
          />
        ) : null}

        {frame >= sceneContext.from && frame < sceneContext.from + sceneContext.dur ? (
          <>
            {wordSlot === 0 ? (
              <CenterText
                text="Digital storefronts"
                opacity={context0.opacity}
                fontSize={74}
                fontWeight={600}
                y={context0.y}
                color="rgba(255,255,255,0.70)"
              />
            ) : null}
            {wordSlot === 1 ? (
              <CenterText
                text="Catalogs"
                opacity={context1.opacity}
                fontSize={74}
                fontWeight={600}
                y={context1.y}
                color="rgba(255,255,255,0.70)"
              />
            ) : null}
            {wordSlot === 2 ? (
              <CenterText
                text="Payments"
                opacity={context2.opacity}
                fontSize={74}
                fontWeight={600}
                y={context2.y}
                color="rgba(255,255,255,0.70)"
              />
            ) : null}
          </>
        ) : null}

        {frame >= sceneTension.from && frame < sceneTension.from + sceneTension.dur + Math.round(0.9 * fps) ? (
          <CenterText
            text="Built for modern businesses"
            opacity={tensionOpacity * tensionFadeDuringReveal}
            fontSize={72}
            fontWeight={600}
            y={0}
            scale={tensionScale}
            color="rgba(255,255,255,0.78)"
          />
        ) : null}

        {frame >= sceneReveal.from ? (
          <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
            <div
              style={{
                opacity: logoIn,
                transform: `scale(${logoScale})`,
                filter: `blur(${logoBlurPx}px)`,
                transformOrigin: 'center',
                color: 'rgba(255,255,255,0.96)',
                fontFamily:
                  "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif",
                fontWeight: 800,
                letterSpacing: '-0.06em',
                fontSize: logoSize,
                lineHeight: 0.92,
                paddingBottom: Math.round(height * 0.02),
                textShadow: [
                  `0 0 ${Math.round(22 * glowBreath)}px rgba(200,230,255,0.06)`,
                  `0 0 ${Math.round(52 * glowBreath)}px rgba(160,190,255,0.04)`,
                  `0 0 ${Math.round(120 * glowBreath)}px rgba(120,120,255,0.03)`,
                ].join(', '),
              }}
            >
              Krafta
            </div>
          </AbsoluteFill>
        ) : null}

        {frame >= sceneReveal.from ? (
          <AbsoluteFill
            style={{
              opacity: logoIn * 0.85,
              backgroundImage:
                'radial-gradient(680px 360px at 50% 52%, rgba(255,255,255,0.05), rgba(0,0,0,0) 70%)',
              mixBlendMode: 'screen',
            }}
          />
        ) : null}

        {frame >= sceneDefinition.from ? (
          <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
            <div
              style={{
                marginTop: Math.round(height * 0.17),
                opacity: definitionOpacity,
                color: 'rgba(255,255,255,0.56)',
                fontFamily:
                  "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif",
                fontWeight: 500,
                letterSpacing: '-0.02em',
                fontSize: 44,
                lineHeight: 1.2,
              }}
            >
              Infrastructure for commerce
            </div>
          </AbsoluteFill>
        ) : null}
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          opacity: endFade,
          backgroundImage:
            'radial-gradient(1400px 900px at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.78) 100%)',
        }}
      />

      <AbsoluteFill
        style={{
          opacity: darken * 0.6 * endFade,
          backgroundColor: '#000',
        }}
      />
    </AbsoluteFill>
  );
};
