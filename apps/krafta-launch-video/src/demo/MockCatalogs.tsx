import React from 'react';
import {typeStyles} from '../components/Type';

export const MockCatalogs: React.FC = () => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: '1.2fr 1fr',
        background:
          'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 100%), radial-gradient(900px 520px at 50% -20%, rgba(255,255,255,0.06), rgba(0,0,0,0) 60%)',
      }}
    >
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
            Catalogs
          </div>
          <div style={{marginLeft: 'auto', display: 'flex', gap: 10}}>
            <div
              style={{
                width: 130,
                height: 34,
                borderRadius: 14,
                background: 'rgba(255,255,255,0.04)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset',
              }}
            />
            <div
              style={{
                width: 108,
                height: 34,
                borderRadius: 14,
                background:
                  'linear-gradient(180deg, rgba(88,172,255,0.22), rgba(168,112,255,0.18))',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.10) inset, 0 16px 60px rgba(120,200,255,0.12)',
              }}
            />
          </div>
        </div>

        <div style={{marginTop: 16, display: 'flex', gap: 10}}>
          {['Products', 'Collections', 'Pricing', 'SEO'].map((tab, i) => (
            <div
              key={tab}
              style={{
                height: 34,
                padding: '0 14px',
                borderRadius: 14,
                display: 'flex',
                alignItems: 'center',
                background: i === 0 ? 'rgba(255,255,255,0.06)' : 'transparent',
                boxShadow: i === 0 ? '0 0 0 1px rgba(255,255,255,0.08) inset' : undefined,
                ...typeStyles,
                fontSize: 13,
                fontWeight: 560,
                color: i === 0 ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.56)',
              }}
            >
              {tab}
            </div>
          ))}
        </div>

        <div style={{marginTop: 16, display: 'grid', gap: 10}}>
          {new Array(7).fill(true).map((_, i) => (
            <div
              key={i}
              style={{
                height: 54,
                borderRadius: 18,
                background: 'rgba(255,255,255,0.035)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset',
                display: 'grid',
                gridTemplateColumns: '56px 1fr 160px',
                gap: 14,
                alignItems: 'center',
                padding: '0 14px',
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  background:
                    i % 3 === 0
                      ? 'linear-gradient(135deg, rgba(88,172,255,0.40), rgba(255,255,255,0.06))'
                      : i % 3 === 1
                        ? 'linear-gradient(135deg, rgba(168,112,255,0.36), rgba(255,255,255,0.06))'
                        : 'linear-gradient(135deg, rgba(90,230,180,0.24), rgba(255,255,255,0.06))',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.08) inset',
                }}
              />
              <div>
                <div
                  style={{
                    ...typeStyles,
                    fontSize: 14,
                    fontWeight: 650,
                    color: 'rgba(255,255,255,0.80)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  Product {i + 1}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    ...typeStyles,
                    fontSize: 12,
                    fontWeight: 520,
                    color: 'rgba(255,255,255,0.50)',
                  }}
                >
                  Variant-ready · Inventory synced
                </div>
              </div>
              <div style={{display: 'flex', gap: 10, justifyContent: 'flex-end'}}>
                <div
                  style={{
                    width: 62,
                    height: 30,
                    borderRadius: 14,
                    background: 'rgba(255,255,255,0.04)',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset',
                  }}
                />
                <div
                  style={{
                    width: 78,
                    height: 30,
                    borderRadius: 14,
                    background: 'rgba(255,255,255,0.06)',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.08) inset',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.02)',
          padding: 22,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            ...typeStyles,
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.62)',
          }}
        >
          Editor
        </div>

        <div style={{marginTop: 16, display: 'grid', gap: 10}}>
          <div
            style={{
              height: 160,
              borderRadius: 18,
              background:
                'linear-gradient(135deg, rgba(88,172,255,0.16), rgba(255,255,255,0.04), rgba(168,112,255,0.14))',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.10) inset',
              filter: 'saturate(1.05)',
            }}
          />
          {['Name', 'Price', 'Availability', 'Description'].map((label, i) => (
            <div
              key={label}
              style={{
                height: 48,
                borderRadius: 18,
                background: 'rgba(255,255,255,0.035)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset',
                padding: '0 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{
                  ...typeStyles,
                  fontSize: 12,
                  fontWeight: 560,
                  color: 'rgba(255,255,255,0.52)',
                }}
              >
                {label}
              </div>
              <div
                style={{
                  width: 120,
                  height: 10,
                  borderRadius: 99,
                  background: 'rgba(255,255,255,0.10)',
                }}
              />
            </div>
          ))}
        </div>

        <div
          style={{
            position: 'absolute',
            inset: -120,
            background:
              'radial-gradient(420px 240px at 70% 20%, rgba(168,112,255,0.22), rgba(0,0,0,0) 60%)',
            opacity: 0.12,
            filter: 'blur(30px)',
          }}
        />
      </div>
    </div>
  );
};
