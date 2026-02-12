import React from 'react';
import {typeStyles} from '../components/Type';

export const MockPayments: React.FC = () => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: '1fr 420px',
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
            Payments
          </div>
          <div style={{marginLeft: 'auto', display: 'flex', gap: 10}}>
            <div
              style={{
                width: 164,
                height: 34,
                borderRadius: 14,
                background: 'rgba(255,255,255,0.04)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset',
              }}
            />
            <div
              style={{
                width: 122,
                height: 34,
                borderRadius: 14,
                background:
                  'linear-gradient(180deg, rgba(90,230,180,0.20), rgba(255,255,255,0.04))',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.10) inset, 0 16px 60px rgba(90,230,180,0.10)',
              }}
            />
          </div>
        </div>

        <div style={{marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14}}>
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
              Success Rate
            </div>
            <div
              style={{
                marginTop: 10,
                ...typeStyles,
                fontSize: 28,
                fontWeight: 740,
                letterSpacing: '-0.03em',
                color: 'rgba(255,255,255,0.90)',
              }}
            >
              99.8%
            </div>
            <div style={{marginTop: 14, display: 'flex', gap: 8}}>
              {new Array(20).fill(true).map((_, i) => (
                <div
                  // eslint-disable-next-line react/no-array-index-key
                  key={i}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 99,
                    background:
                      i > 16
                        ? 'rgba(255,255,255,0.08)'
                        : 'linear-gradient(180deg, rgba(90,230,180,0.78), rgba(88,172,255,0.55))',
                    boxShadow: i <= 16 ? '0 0 20px rgba(90,230,180,0.14)' : undefined,
                    opacity: i <= 16 ? 0.9 : 0.6,
                  }}
                />
              ))}
            </div>
            <div
              style={{
                position: 'absolute',
                inset: -120,
                background:
                  'radial-gradient(420px 220px at 28% 20%, rgba(90,230,180,0.22), rgba(0,0,0,0) 60%)',
                opacity: 0.12,
                filter: 'blur(28px)',
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
              Methods
            </div>
            <div style={{marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10}}>
              {['Card', 'Bank', 'Wallet', 'Invoice'].map((label, i) => (
                <div
                  key={label}
                  style={{
                    height: 44,
                    borderRadius: 16,
                    background: 'rgba(255,255,255,0.04)',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 14px',
                    justifyContent: 'space-between',
                  }}
                >
                  <div
                    style={{
                      ...typeStyles,
                      fontSize: 13,
                      fontWeight: 560,
                      color: 'rgba(255,255,255,0.70)',
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      width: 44,
                      height: 22,
                      borderRadius: 999,
                      background: i === 0 || i === 2 ? 'rgba(90,230,180,0.18)' : 'rgba(255,255,255,0.06)',
                      boxShadow: '0 0 0 1px rgba(255,255,255,0.08) inset',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{marginTop: 14}}>
          <div
            style={{
              height: 260,
              borderRadius: 18,
              background: 'rgba(255,255,255,0.03)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset',
              padding: 18,
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
              Recent Transactions
            </div>
            <div style={{marginTop: 14, display: 'grid', gap: 10}}>
              {new Array(6).fill(true).map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: 40,
                    borderRadius: 14,
                    background: 'rgba(255,255,255,0.04)',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset',
                    display: 'grid',
                    gridTemplateColumns: '1fr 120px 90px',
                    alignItems: 'center',
                    padding: '0 12px',
                    gap: 10,
                  }}
                >
                  <div style={{display: 'flex', alignItems: 'center'}}>
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 99,
                        marginRight: 10,
                        background: i % 2 === 0 ? 'rgba(90,230,180,0.75)' : 'rgba(88,172,255,0.75)',
                        boxShadow: '0 0 18px rgba(90,230,180,0.14)',
                      }}
                    />
                    <div
                      style={{
                        ...typeStyles,
                        fontSize: 13,
                        fontWeight: 560,
                        color: 'rgba(255,255,255,0.70)',
                      }}
                    >
                      Order #{1042 + i}
                    </div>
                  </div>
                  <div
                    style={{
                      ...typeStyles,
                      fontSize: 12,
                      fontWeight: 520,
                      color: 'rgba(255,255,255,0.52)',
                      textAlign: 'right',
                    }}
                  >
                    {i % 2 === 0 ? 'Succeeded' : 'Pending'}
                  </div>
                  <div
                    style={{
                      ...typeStyles,
                      fontSize: 12,
                      fontWeight: 650,
                      color: 'rgba(255,255,255,0.70)',
                      textAlign: 'right',
                    }}
                  >
                    ${(260 + i * 18).toFixed(0)}
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                position: 'absolute',
                inset: -140,
                background:
                  'radial-gradient(420px 220px at 70% 20%, rgba(88,172,255,0.22), rgba(0,0,0,0) 60%)',
                opacity: 0.12,
                filter: 'blur(30px)',
              }}
            />
          </div>
        </div>
      </div>

      <div
        style={{
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.02)',
          padding: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
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
            Checkout
          </div>
          <div style={{marginTop: 12, display: 'grid', gap: 10}}>
            <div
              style={{
                height: 44,
                borderRadius: 16,
                background: 'rgba(255,255,255,0.04)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset',
              }}
            />
            <div
              style={{
                height: 44,
                borderRadius: 16,
                background: 'rgba(255,255,255,0.04)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset',
              }}
            />
            <div
              style={{
                height: 44,
                borderRadius: 16,
                background:
                  'linear-gradient(180deg, rgba(88,172,255,0.22), rgba(168,112,255,0.18))',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.10) inset, 0 16px 60px rgba(120,200,255,0.12)',
              }}
            />
          </div>
        </div>

        <div
          style={{
            borderRadius: 18,
            padding: 18,
            background: 'rgba(255,255,255,0.035)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset',
            flex: 1,
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
            Risk
          </div>
          <div style={{marginTop: 14, display: 'grid', gap: 10}}>
            {['Velocity', 'Fraud', 'Chargebacks', 'Disputes'].map((label, i) => (
              <div
                key={label}
                style={{
                  height: 46,
                  borderRadius: 16,
                  background: 'rgba(255,255,255,0.04)',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 14px',
                }}
              >
                <div
                  style={{
                    ...typeStyles,
                    fontSize: 12,
                    fontWeight: 560,
                    color: 'rgba(255,255,255,0.58)',
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    width: 90,
                    height: 10,
                    borderRadius: 99,
                    background: 'rgba(255,255,255,0.10)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${72 - i * 11}%`,
                      height: '100%',
                      background:
                        i <= 1
                          ? 'linear-gradient(90deg, rgba(90,230,180,0.55), rgba(88,172,255,0.35))'
                          : 'linear-gradient(90deg, rgba(255,255,255,0.16), rgba(255,255,255,0.10))',
                      borderRadius: 99,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
