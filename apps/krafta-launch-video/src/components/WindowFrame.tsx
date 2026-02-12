import React from 'react';
import {typeStyles} from './Type';

type Props = {
  children: React.ReactNode;
  title?: string;
  width: number;
  height: number;
  radius?: number;
};

export const WindowFrame: React.FC<Props> = ({children, title, width, height, radius = 26}) => {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        overflow: 'hidden',
        background: 'rgba(10,10,12,0.92)',
        boxShadow: [
          '0 40px 120px rgba(0,0,0,0.75)',
          '0 0 0 1px rgba(255,255,255,0.07) inset',
          '0 0 0 1px rgba(0,0,0,0.8)',
        ].join(', '),
        backdropFilter: 'blur(14px)',
      }}
    >
      <div
        style={{
          height: 52,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 18px',
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{display: 'flex', gap: 8}}>
          <div style={{width: 10, height: 10, borderRadius: 99, background: 'rgba(255,95,86,0.9)'}} />
          <div style={{width: 10, height: 10, borderRadius: 99, background: 'rgba(255,189,46,0.9)'}} />
          <div style={{width: 10, height: 10, borderRadius: 99, background: 'rgba(39,201,63,0.9)'}} />
        </div>
        <div
          style={{
            marginLeft: 10,
            ...typeStyles,
            fontSize: 14,
            color: 'rgba(255,255,255,0.64)',
            fontWeight: 550,
          }}
        >
          {title ?? 'Krafta'}
        </div>
        <div style={{marginLeft: 'auto', display: 'flex', gap: 10, opacity: 0.6}}>
          <div style={{width: 8, height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.35)'}} />
          <div style={{width: 8, height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.25)'}} />
        </div>
      </div>

      <div style={{position: 'relative', width: '100%', height: height - 52}}>{children}</div>
    </div>
  );
};

