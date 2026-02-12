import React from 'react';
import {typeStyles} from '../components/Type';

const Card: React.FC<{title: string; value: string; accent: 'ice' | 'violet' | 'mint'}> = ({
  title,
  value,
  accent,
}) => {
  const accentColor =
    accent === 'ice' ? 'rgba(88,172,255,0.9)' : accent === 'violet' ? 'rgba(168,112,255,0.9)' : 'rgba(90,230,180,0.9)';
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 18,
        background: 'rgba(255,255,255,0.045)',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: -80,
          background: `radial-gradient(240px 160px at 25% 20%, ${accentColor} 0%, rgba(0,0,0,0) 60%)`,
          opacity: 0.18,
          filter: 'blur(18px)',
        }}
      />
      <div style={{position: 'relative'}}>
        <div
          style={{
            ...typeStyles,
            fontSize: 12,
            letterSpacing: '-0.01em',
            fontWeight: 550,
            color: 'rgba(255,255,255,0.55)',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 8,
            ...typeStyles,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: 'rgba(255,255,255,0.9)',
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
};

export const MockDashboard: React.FC = () => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: '260px 1fr',
        background:
          'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.4) 100%), radial-gradient(900px 540px at 50% -20%, rgba(255,255,255,0.06), rgba(0,0,0,0) 60%)',
      }}
    >
      <div
        style={{
          padding: 18,
          borderRight: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div
          style={{
            ...typeStyles,
            fontWeight: 750,
            letterSpacing: '-0.03em',
            color: 'rgba(255,255,255,0.9)',
            fontSize: 16,
          }}
        >
          Krafta
        </div>
        <div style={{marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10}}>
          {['Overview', 'Catalogs', 'Orders', 'Payments', 'Settings'].map((item, i) => (
            <div
              key={item}
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                background: i === 0 ? 'rgba(255,255,255,0.06)' : 'transparent',
                boxShadow: i === 0 ? '0 0 0 1px rgba(255,255,255,0.07) inset' : undefined,
                ...typeStyles,
                fontSize: 13,
                color: i === 0 ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.58)',
                fontWeight: 550,
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>

      <div style={{padding: 22}}>
        <div style={{display: 'flex', alignItems: 'center'}}>
          <div
            style={{
              ...typeStyles,
              fontSize: 14,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.62)',
            }}
          >
            Overview
          </div>
          <div style={{marginLeft: 'auto', display: 'flex', gap: 10}}>
            <div
              style={{
                width: 180,
                height: 34,
                borderRadius: 14,
                background: 'rgba(255,255,255,0.04)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset',
              }}
            />
            <div
              style={{
                width: 92,
                height: 34,
                borderRadius: 14,
                background: 'rgba(255,255,255,0.06)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.08) inset',
              }}
            />
          </div>
        </div>

        <div style={{marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14}}>
          <Card title="Gross Volume" value="$2.4M" accent="ice" />
          <Card title="Net Revenue" value="$318k" accent="violet" />
          <Card title="Conversion" value="4.9%" accent="mint" />
        </div>

        <div style={{marginTop: 14, display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14}}>
          <div
            style={{
              borderRadius: 18,
              padding: 18,
              background: 'rgba(255,255,255,0.035)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              style={{
                ...typeStyles,
                fontSize: 12,
                fontWeight: 550,
                color: 'rgba(255,255,255,0.55)',
                textTransform: 'uppercase',
              }}
            >
              Sales
            </div>
            <div style={{marginTop: 16, display: 'flex', gap: 10, alignItems: 'flex-end', height: 120}}>
              {new Array(18).fill(true).map((_, i) => {
                const h = 28 + Math.round((Math.sin(i * 0.6) + 1) * 42) + (i % 5) * 5;
                const glow = i > 12 ? 1 : 0;
                return (
                  <div
                    key={i}
                    style={{
                      width: 12,
                      height: h,
                      borderRadius: 99,
                      background:
                        glow > 0
                          ? 'linear-gradient(180deg, rgba(88,172,255,0.9), rgba(168,112,255,0.75))'
                          : 'rgba(255,255,255,0.10)',
                      boxShadow: glow > 0 ? '0 0 30px rgba(120,200,255,0.16)' : undefined,
                      opacity: glow > 0 ? 0.95 : 0.7,
                    }}
                  />
                );
              })}
            </div>
            <div
              style={{
                position: 'absolute',
                inset: -120,
                background:
                  'radial-gradient(420px 220px at 70% 40%, rgba(88,172,255,0.25), rgba(0,0,0,0) 60%)',
                opacity: 0.12,
                filter: 'blur(26px)',
              }}
            />
          </div>

          <div
            style={{
              borderRadius: 18,
              padding: 18,
              background: 'rgba(255,255,255,0.035)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset',
            }}
          >
            <div
              style={{
                ...typeStyles,
                fontSize: 12,
                fontWeight: 550,
                color: 'rgba(255,255,255,0.55)',
                textTransform: 'uppercase',
              }}
            >
              Activity
            </div>
            <div style={{marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10}}>
              {['New catalog published', 'Payment method added', 'Order workflow updated', 'Storefront deployed'].map(
                (item, i) => (
                  <div
                    key={item}
                    style={{
                      height: 36,
                      borderRadius: 14,
                      background: 'rgba(255,255,255,0.04)',
                      boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 12px',
                      ...typeStyles,
                      fontSize: 13,
                      color: 'rgba(255,255,255,0.66)',
                      fontWeight: 520,
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 99,
                        marginRight: 10,
                        background: i % 2 === 0 ? 'rgba(88,172,255,0.8)' : 'rgba(168,112,255,0.8)',
                        boxShadow: '0 0 18px rgba(120,200,255,0.18)',
                      }}
                    />
                    {item}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
