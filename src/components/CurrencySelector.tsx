// ============================================================================
// CURRENCY SELECTOR — Dropdown to switch between SOL and Csol trading
// Appears when user clicks the balance display in the header
// ============================================================================

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Check, ChevronDown } from 'lucide-react';
import solanaLogo from '../assets/logo_solana.png';

interface CurrencySelectorProps {
  activeCurrency: 'sol' | 'csol';
  onCurrencyChange: (currency: 'sol' | 'csol') => void;
  solBalance: number;
  csolBalance: number;
  isParticipating: boolean;
}

const CurrencySelector: React.FC<CurrencySelectorProps> = ({
  activeCurrency,
  onCurrencyChange,
  solBalance,
  csolBalance,
  isParticipating,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = (currency: 'sol' | 'csol') => {
    onCurrencyChange(currency);
    setOpen(false);
  };

  const isCsol = activeCurrency === 'csol';

  return (
    <div className="currency-selector-container" ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger — Balance Box */}
      <button
        type="button"
        onClick={() => isParticipating ? setOpen(prev => !prev) : undefined}
        className={`header-balance-box ${isCsol ? 'header-balance-csol' : ''}`}
        style={{
          height: 36,
          borderRadius: 8,
          padding: '0 12px',
          background: isCsol ? 'rgba(168, 85, 247, 0.1)' : '#0d1117',
          border: isCsol ? '1px solid rgba(168, 85, 247, 0.4)' : '1px solid rgba(248, 248, 252, 0.15)',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          cursor: isParticipating ? 'pointer' : 'default',
          transition: 'all 0.2s ease',
        }}
      >
        {isCsol ? (
          <Zap size={18} style={{ color: '#A855F7', fill: '#A855F7' }} />
        ) : (
          <img src={solanaLogo} alt="SOL" style={{ width: 20, height: 20 }} />
        )}
        <span
          style={{
            fontFamily: "'DynaPuff', sans-serif",
            fontSize: 14,
            fontWeight: 600,
            color: isCsol ? '#A855F7' : '#00FFA3',
            textShadow: isCsol ? '0 0 8px rgba(168, 85, 247, 0.3)' : '0 0 8px rgba(0, 255, 163, 0.3)',
          }}
        >
          {isCsol ? csolBalance.toFixed(3) : solBalance.toFixed(3)}
        </span>
        {isParticipating && (
          <ChevronDown size={12} style={{ opacity: 0.5, color: isCsol ? '#A855F7' : '#9CA3AF' }} />
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="currency-selector-dropdown"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              minWidth: 200,
              background: '#131722',
              border: '1px solid rgba(248, 248, 252, 0.12)',
              borderRadius: 10,
              padding: '6px',
              zIndex: 100,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
          >
            {/* SOL row */}
            <button
              type="button"
              onClick={() => handleSelect('sol')}
              className="currency-selector-row"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                border: 'none',
                background: activeCurrency === 'sol' ? 'rgba(0, 255, 163, 0.08)' : 'transparent',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
            >
              <img src={solanaLogo} alt="SOL" style={{ width: 22, height: 22 }} />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontFamily: "'DynaPuff', sans-serif", fontSize: 13, fontWeight: 600, color: '#f8f8fc' }}>
                  SOL
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>Game balance</div>
              </div>
              <span style={{ fontFamily: "'DynaPuff', sans-serif", fontSize: 13, fontWeight: 600, color: '#00FFA3' }}>
                {solBalance.toFixed(3)}
              </span>
              {activeCurrency === 'sol' && <Check size={14} style={{ color: '#00FFA3' }} />}
            </button>

            {/* Csol row */}
            <button
              type="button"
              onClick={() => handleSelect('csol')}
              className="currency-selector-row"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                border: 'none',
                background: activeCurrency === 'csol' ? 'rgba(168, 85, 247, 0.08)' : 'transparent',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
                marginTop: 2,
              }}
            >
              <Zap size={22} style={{ color: '#A855F7', fill: '#A855F7' }} />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontFamily: "'DynaPuff', sans-serif", fontSize: 13, fontWeight: 600, color: '#f8f8fc' }}>
                  Csol
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>Competition only</div>
              </div>
              <span style={{ fontFamily: "'DynaPuff', sans-serif", fontSize: 13, fontWeight: 600, color: '#A855F7' }}>
                {csolBalance.toFixed(3)}
              </span>
              {activeCurrency === 'csol' && <Check size={14} style={{ color: '#A855F7' }} />}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CurrencySelector;
