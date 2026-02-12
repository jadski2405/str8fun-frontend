import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, ArrowDownToLine, ArrowUpFromLine, ChevronDown, X, Menu, User } from 'lucide-react';
import { useLogin, usePrivy } from '@privy-io/react-auth';
import { useSolanaWallet } from '../hooks/useSolanaWallet';
import BlitzHeaderCarousel from './BlitzHeaderCarousel';
import CurrencySelector from './CurrencySelector';
import type { PlayerXpState } from '../types/game';
import type { BlitzState } from '../hooks/useBlitz';
import solanaLogo from '../assets/logo_solana.png';

interface GlobalHeaderProps {
  // Props can be extended as needed
  onOpenDeposit?: () => void;
  onOpenWithdraw?: () => void;
  onToggleChat?: () => void;
  xpState?: PlayerXpState | null;
  onOpenChests?: () => void;
  blitz?: BlitzState;
  activeCurrency?: 'sol' | 'csol';
  onCurrencyChange?: (currency: 'sol' | 'csol') => void;
}

// Color themes for dropdowns
const DROPDOWN_THEMES = {
  withdraw: {
    primary: '#ff4d4d',
    primaryActive: '#e63946',
    icon: ArrowUpFromLine,
    title: 'Withdraw SOL',
    placeholder: 'Amount to withdraw',
    buttonText: 'Withdraw',
  },
  deposit: {
    primary: '#22c55e',
    primaryActive: '#16a34a',
    icon: ArrowDownToLine,
    title: 'Deposit SOL',
    placeholder: 'Amount to deposit',
    buttonText: 'Deposit',
  },
};

// Shared Dropdown Shell Component
interface TransactionDropdownProps {
  type: 'withdraw' | 'deposit';
  isOpen: boolean;
  onClose: () => void;
  balance: number;
  onTransaction: (amount: number, promoCode?: string) => Promise<{ success: boolean; error?: string }>;
}

const TransactionDropdown: React.FC<TransactionDropdownProps> = ({ 
  type, 
  isOpen, 
  onClose,
  balance,
  onTransaction,
}) => {
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoStatus, setPromoStatus] = useState<'idle' | 'applied' | 'invalid'>('idle');
  const [showPromoInput, setShowPromoInput] = useState(false);
  const theme = DROPDOWN_THEMES[type];
  const Icon = theme.icon;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    
    if (amountNum > balance) {
      setError(`Insufficient ${type === 'withdraw' ? 'game' : 'wallet'} balance`);
      return;
    }
    
    setIsProcessing(true);
    try {
      const code = (type === 'deposit' && promoStatus === 'applied' && promoCode.length === 4) ? promoCode : undefined;
      const result = await onTransaction(amountNum, code);
      if (result.success) {
        setSuccess(true);
        setAmount('');
        setPromoCode('');
        setPromoStatus('idle');
        setShowPromoInput(false);
        // Auto-close after success
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 1500);
      } else {
        setError(result.error || `${type} failed`);
      }
    } catch (err) {
      setError('Transaction failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMaxClick = () => {
    const formatted = balance < 0.001 ? '0.000' : balance.toFixed(3);
    setAmount(formatted);
    setError(null);
  };
  
  // Clear state when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      setAmount('');
      setError(null);
      setSuccess(false);
      setIsProcessing(false);
      setPromoCode('');
      setPromoStatus('idle');
      setShowPromoInput(false);
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="css-1ezwwt5"
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          style={{
            // Shared Dropdown Shell Styles
            width: 320,
            maxHeight: '80vh',
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            backgroundColor: 'rgb(30, 32, 42)',
            borderRadius: 12,
            border: '1px solid rgb(58, 61, 74)',
            boxShadow: 'rgba(0, 0, 0, 0.3) 0px 8px 32px',
            zIndex: 100,
            overflow: 'hidden',
            boxSizing: 'border-box',
            // CSS Variables for theming
            ['--color-primary' as string]: theme.primary,
            ['--color-primary-active' as string]: theme.primaryActive,
          }}
        >
          {/* Header */}
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid rgb(58, 61, 74)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon size={18} style={{ color: theme.primary }} />
              <span 
                style={{ 
                  fontFamily: "'DynaPuff', sans-serif",
                  fontSize: 16,
                  fontWeight: 600,
                  color: 'rgb(248, 248, 252)',
                }}
              >
                {theme.title}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
            >
              <X size={16} color="rgb(248, 248, 252)" />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', padding: 20, gap: 16 }}>
            {/* Balance Display */}
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: 8,
              }}
            >
              <span style={{ fontFamily: "'DynaPuff', sans-serif", fontSize: 12, color: 'rgba(248, 248, 252, 0.6)' }}>
                {type === 'withdraw' ? 'Game Balance' : 'Wallet Balance'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'DynaPuff', sans-serif", fontSize: 14, fontWeight: 600, color: theme.primary }}>
                <img src={solanaLogo} alt="SOL" style={{ width: 22, height: 22 }} />
                {balance.toFixed(4)}
              </span>
            </div>

            {/* Promo Code - Deposit Only */}
            {type === 'deposit' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowPromoInput(!showPromoInput)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontFamily: "'DynaPuff', sans-serif",
                    fontSize: 12,
                    color: 'rgb(248, 248, 252)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'opacity 0.2s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                >
                  {showPromoInput ? '▾ Have a promo code?' : '▸ Have a promo code?'}
                </button>
                {showPromoInput && (
                  <>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        value={promoCode}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                          setPromoCode(val);
                          setPromoStatus('idle');
                        }}
                        placeholder="Enter code"
                        maxLength={4}
                        style={{
                          flex: 1,
                          height: 40,
                          padding: '0 12px',
                          background: 'rgb(21, 22, 29)',
                          border: `2px solid ${promoStatus === 'applied' ? '#22c55e' : promoStatus === 'invalid' ? '#ef4444' : 'rgb(58, 61, 74)'}`,
                          borderRadius: 8,
                          fontFamily: "'DynaPuff', sans-serif",
                          fontSize: 14,
                          color: 'rgb(248, 248, 252)',
                          outline: 'none',
                          textAlign: 'center',
                          letterSpacing: '0.15em',
                          boxSizing: 'border-box',
                          transition: 'border-color 0.2s ease',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (promoCode.length === 4) {
                            setPromoStatus('applied');
                          } else {
                            setPromoStatus('invalid');
                          }
                        }}
                        disabled={promoCode.length !== 4}
                        style={{
                          padding: '0 16px',
                          height: 40,
                          background: promoCode.length === 4 ? '#22c55e' : 'rgba(255,255,255,0.1)',
                          border: 'none',
                          borderRadius: 8,
                          fontFamily: "'DynaPuff', sans-serif",
                          fontSize: 12,
                          fontWeight: 600,
                          color: promoCode.length === 4 ? 'rgb(21, 22, 29)' : 'rgba(248,248,252,0.4)',
                          cursor: promoCode.length === 4 ? 'pointer' : 'not-allowed',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        Apply
                      </button>
                    </div>
                    {promoStatus === 'applied' && (
                      <span style={{ fontFamily: "'DynaPuff', sans-serif", fontSize: 11, color: '#22c55e' }}>✅ Promo applied — bonus on deposit</span>
                    )}
                    {promoStatus === 'invalid' && (
                      <span style={{ fontFamily: "'DynaPuff', sans-serif", fontSize: 11, color: '#ef4444' }}>❌ Enter a valid 4-digit code</span>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Amount Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label 
                style={{ 
                  fontFamily: "'DynaPuff', sans-serif", 
                  fontSize: 12, 
                  color: 'rgba(248, 248, 252, 0.6)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Amount
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  max={balance}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={theme.placeholder}
                  style={{
                    width: '100%',
                    height: 48,
                    padding: '0 70px 0 16px',
                    background: 'rgb(21, 22, 29)',
                    border: `2px solid ${amount ? theme.primary : 'rgb(58, 61, 74)'}`,
                    borderRadius: 8,
                    fontFamily: "'DynaPuff', sans-serif",
                    fontSize: 16,
                    color: 'rgb(248, 248, 252)',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = theme.primary;
                  }}
                  onBlur={(e) => {
                    if (!amount) e.currentTarget.style.borderColor = 'rgb(58, 61, 74)';
                  }}
                />
                <button
                  type="button"
                  onClick={handleMaxClick}
                  style={{
                    position: 'absolute',
                    right: 8,
                    padding: '6px 12px',
                    background: theme.primary,
                    border: 'none',
                    borderRadius: 6,
                    fontFamily: "'DynaPuff', sans-serif",
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'rgb(21, 22, 29)',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    transition: 'background 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = theme.primaryActive;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = theme.primary;
                  }}
                >
                  Max
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div 
                style={{
                  padding: '10px 14px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: 8,
                  fontFamily: "'DynaPuff', sans-serif",
                  fontSize: 12,
                  color: '#ef4444',
                  textAlign: 'center',
                }}
              >
                {error}
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div 
                style={{
                  padding: '10px 14px',
                  background: 'rgba(34, 197, 94, 0.15)',
                  border: '1px solid rgba(34, 197, 94, 0.4)',
                  borderRadius: 8,
                  fontFamily: "'DynaPuff', sans-serif",
                  fontSize: 12,
                  color: '#22c55e',
                  textAlign: 'center',
                }}
              >
                {type === 'deposit' ? 'Deposit successful!' : 'Withdrawal successful!'}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isProcessing}
              style={{
                width: '100%',
                height: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: isProcessing
                  ? 'rgba(255, 255, 255, 0.1)' 
                  : theme.primary,
                border: 'none',
                borderRadius: 8,
                fontFamily: "'DynaPuff', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                textTransform: 'uppercase',
                color: isProcessing
                  ? 'rgba(248, 248, 252, 0.4)' 
                  : 'rgb(21, 22, 29)',
                cursor: isProcessing
                  ? 'not-allowed' 
                  : 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: isProcessing
                  ? 'none'
                  : `${theme.primary}66 0px 4px 16px`,
              }}
              onMouseEnter={(e) => {
                if (!isProcessing) {
                  e.currentTarget.style.background = theme.primaryActive;
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isProcessing) {
                  e.currentTarget.style.background = theme.primary;
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              {isProcessing ? (
                <>
                  <div style={{
                    width: 16,
                    height: 16,
                    border: '2px solid rgba(248, 248, 252, 0.3)',
                    borderTopColor: 'rgb(248, 248, 252)',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
                  Processing...
                </>
              ) : (
                <>
                  <Icon size={16} />
                  {theme.buttonText}
                </>
              )}
            </button>

            {/* Info Text */}
            <p 
              style={{ 
                fontFamily: "'DynaPuff', sans-serif", 
                fontSize: 11, 
                color: 'rgba(248, 248, 252, 0.4)',
                textAlign: 'center',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {type === 'withdraw' 
                ? 'Funds will be sent to your connected wallet'
                : 'Deposit SOL from your wallet to play games'
              }
            </p>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Mobile Transaction Modal (centered popup)
interface MobileTransactionModalProps {
  type: 'withdraw' | 'deposit';
  isOpen: boolean;
  onClose: () => void;
  balance: number;
  onTransaction: (amount: number, promoCode?: string) => Promise<{ success: boolean; error?: string }>;
}

const MobileTransactionModal: React.FC<MobileTransactionModalProps> = ({ 
  type, 
  isOpen, 
  onClose,
  balance,
  onTransaction,
}) => {
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoStatus, setPromoStatus] = useState<'idle' | 'applied' | 'invalid'>('idle');
  const [showPromoInput, setShowPromoInput] = useState(false);
  const theme = DROPDOWN_THEMES[type];
  const Icon = theme.icon;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    
    if (amountNum > balance) {
      setError(`Insufficient ${type === 'withdraw' ? 'game' : 'wallet'} balance`);
      return;
    }
    
    setIsProcessing(true);
    try {
      const code = (type === 'deposit' && promoStatus === 'applied' && promoCode.length === 4) ? promoCode : undefined;
      const result = await onTransaction(amountNum, code);
      if (result.success) {
        setSuccess(true);
        setAmount('');
        setPromoCode('');
        setPromoStatus('idle');
        setShowPromoInput(false);
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 1500);
      } else {
        setError(result.error || `${type} failed`);
      }
    } catch (err) {
      setError('Transaction failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMaxClick = () => {
    const formatted = balance < 0.001 ? '0.000' : balance.toFixed(3);
    setAmount(formatted);
    setError(null);
  };

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setAmount('');
      setError(null);
      setSuccess(false);
      setIsProcessing(false);
      setPromoCode('');
      setPromoStatus('idle');
      setShowPromoInput(false);
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="mobile-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />
          {/* Modal */}
          <motion.div
            className="mobile-modal-content"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.2 }}
            style={{
              ['--color-primary' as string]: theme.primary,
              ['--color-primary-active' as string]: theme.primaryActive,
            }}
          >
            {/* Header */}
            <div className="mobile-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon size={18} style={{ color: theme.primary }} />
                <span style={{ fontFamily: "'DynaPuff', sans-serif", fontSize: 16, fontWeight: 600, color: 'rgb(248, 248, 252)' }}>
                  {theme.title}
                </span>
              </div>
              <button type="button" onClick={onClose} className="mobile-modal-close-btn">
                <X size={16} color="rgb(248, 248, 252)" />
              </button>
            </div>

            {/* Content */}
            <form onSubmit={handleSubmit} className="mobile-modal-form">
              {/* Balance Display */}
              <div className="mobile-modal-balance">
                <span style={{ fontFamily: "'DynaPuff', sans-serif", fontSize: 12, color: 'rgba(248, 248, 252, 0.6)' }}>
                  {type === 'withdraw' ? 'Game Balance' : 'Wallet Balance'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'DynaPuff', sans-serif", fontSize: 14, fontWeight: 600, color: theme.primary }}>
                  <img src={solanaLogo} alt="SOL" style={{ width: 22, height: 22 }} />
                  {balance.toFixed(4)}
                </span>
              </div>

              {/* Promo Code - Deposit Only */}
              {type === 'deposit' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowPromoInput(!showPromoInput)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      fontFamily: "'DynaPuff', sans-serif",
                      fontSize: 12,
                      color: 'rgb(248, 248, 252)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'opacity 0.2s ease',
                    }}
                  >
                    {showPromoInput ? '▾ Have a promo code?' : '▸ Have a promo code?'}
                  </button>
                  {showPromoInput && (
                    <>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="text"
                          value={promoCode}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                            setPromoCode(val);
                            setPromoStatus('idle');
                          }}
                          placeholder="Enter code"
                          maxLength={4}
                          style={{
                            flex: 1,
                            height: 40,
                            padding: '0 12px',
                            background: 'rgb(21, 22, 29)',
                            border: `2px solid ${promoStatus === 'applied' ? '#22c55e' : promoStatus === 'invalid' ? '#ef4444' : 'rgb(58, 61, 74)'}`,
                            borderRadius: 8,
                            fontFamily: "'DynaPuff', sans-serif",
                            fontSize: 14,
                            color: 'rgb(248, 248, 252)',
                            outline: 'none',
                            textAlign: 'center',
                            letterSpacing: '0.15em',
                            boxSizing: 'border-box' as const,
                            transition: 'border-color 0.2s ease',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (promoCode.length === 4) {
                              setPromoStatus('applied');
                            } else {
                              setPromoStatus('invalid');
                            }
                          }}
                          disabled={promoCode.length !== 4}
                          style={{
                            padding: '0 16px',
                            height: 40,
                            background: promoCode.length === 4 ? '#22c55e' : 'rgba(255,255,255,0.1)',
                            border: 'none',
                            borderRadius: 8,
                            fontFamily: "'DynaPuff', sans-serif",
                            fontSize: 12,
                            fontWeight: 600,
                            color: promoCode.length === 4 ? 'rgb(21, 22, 29)' : 'rgba(248,248,252,0.4)',
                            cursor: promoCode.length === 4 ? 'pointer' : 'not-allowed',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          Apply
                        </button>
                      </div>
                      {promoStatus === 'applied' && (
                        <span style={{ fontFamily: "'DynaPuff', sans-serif", fontSize: 11, color: '#22c55e' }}>✅ Promo applied — bonus on deposit</span>
                      )}
                      {promoStatus === 'invalid' && (
                        <span style={{ fontFamily: "'DynaPuff', sans-serif", fontSize: 11, color: '#ef4444' }}>❌ Enter a valid 4-digit code</span>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Amount Input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontFamily: "'DynaPuff', sans-serif", fontSize: 12, color: 'rgba(248, 248, 252, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Amount
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    max={balance}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={theme.placeholder}
                    className="mobile-modal-input"
                    style={{ borderColor: amount ? theme.primary : 'rgb(58, 61, 74)' }}
                  />
                  <button
                    type="button"
                    onClick={handleMaxClick}
                    className="mobile-modal-max-btn"
                    style={{ background: theme.primary }}
                  >
                    Max
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div 
                  style={{
                    padding: '10px 14px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    borderRadius: 8,
                    fontFamily: "'DynaPuff', sans-serif",
                    fontSize: 12,
                    color: '#ef4444',
                    textAlign: 'center',
                  }}
                >
                  {error}
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div 
                  style={{
                    padding: '10px 14px',
                    background: 'rgba(34, 197, 94, 0.15)',
                    border: '1px solid rgba(34, 197, 94, 0.4)',
                    borderRadius: 8,
                    fontFamily: "'DynaPuff', sans-serif",
                    fontSize: 12,
                    color: '#22c55e',
                    textAlign: 'center',
                  }}
                >
                  {type === 'deposit' ? 'Deposit successful!' : 'Withdrawal successful!'}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isProcessing}
                className="mobile-modal-submit-btn"
                style={{
                  background: isProcessing ? 'rgba(128, 128, 128, 0.5)' : theme.primary,
                  color: 'rgb(21, 22, 29)',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  opacity: isProcessing ? 0.7 : 1,
                }}
              >
                <Icon size={16} />
                {isProcessing ? 'Processing...' : theme.buttonText}
              </button>

              {/* Info Text */}
              <p style={{ fontFamily: "'DynaPuff', sans-serif", fontSize: 11, color: 'rgba(248, 248, 252, 0.4)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
                {type === 'withdraw' 
                  ? 'Funds will be sent to your connected wallet'
                  : 'Deposit SOL from your wallet to play games'
                }
              </p>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// STR8.FUN Logo Component with gradient
const Logo: React.FC = () => (
  <span 
    className="text-2xl font-bold tracking-wide"
    style={{ 
      fontFamily: "'DynaPuff', sans-serif",
      background: 'linear-gradient(to right, #00ff88, #00cc6a)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    }}
  >
    STR8.FUN
  </span>
);

// Game Navigation Buttons Component - Desktop Only
const GameNavButtons: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const isPumpit = location.pathname === '/';
  const isSolpong = location.pathname === '/solpong';
  
  const baseButtonStyle: React.CSSProperties = {
    height: 36,
    borderRadius: 8,
    padding: '0 12px',
    background: '#facc15',
    border: 'none',
    fontFamily: "'DynaPuff', sans-serif",
    fontSize: 14,
    fontWeight: 600,
    textTransform: 'uppercase',
    color: 'rgb(13, 14, 18)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  };
  
  const activeGlow = 'rgba(250, 204, 21, 0.4) 0px 0px 12px 0px, #b89b10 0px 4px 0px 0px';
  const inactiveShadow = '#b89b10 0px 4px 0px 0px';
  
  return (
    <div 
      className="game-nav-desktop"
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 12,
        marginLeft: 32,
      }}
    >
      <button
        type="button"
        onClick={() => navigate('/')}
        style={{
          ...baseButtonStyle,
          boxShadow: isPumpit ? activeGlow : inactiveShadow,
        }}
      >
        <span>🎰</span>
        <span>Pumpit</span>
      </button>
      <button
        type="button"
        onClick={() => navigate('/solpong')}
        style={{
          ...baseButtonStyle,
          boxShadow: isSolpong ? activeGlow : inactiveShadow,
        }}
      >
        <span>🏓</span>
        <span>SolPong</span>
      </button>
    </div>
  );
};

const GlobalHeader: React.FC<GlobalHeaderProps> = ({ onToggleChat: _onToggleChat, onOpenDeposit, onOpenWithdraw, xpState, onOpenChests, blitz, activeCurrency, onCurrencyChange }) => {
  // Router hooks for navigation
  const location = useLocation();
  const navigate = useNavigate();
  
  // Privy auth state - for logout and direct login
  const { logout } = usePrivy();
  const { login } = useLogin({
    onError: (error) => {
      console.error('[Privy] Login error:', error);
    },
  });
  
  // Global wallet state - SINGLE SOURCE OF TRUTH for wallet connection
  const { 
    isConnected, 
    publicKey: walletAddress, 
    username, 
    depositedBalance, 
    balance, 
    deposit, 
    withdraw,
    disconnect: disconnectWallet,
  } = useSolanaWallet();
  
  // Dropdown states
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [showDepositMenu, setShowDepositMenu] = useState(false);
  const [showWithdrawMenu, setShowWithdrawMenu] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [showMobileDeposit, setShowMobileDeposit] = useState(false);
  const [showMobileWithdraw, setShowMobileWithdraw] = useState(false);
  const [showDepositPromo, setShowDepositPromo] = useState(false);
  const depositPromoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Refs for click outside handling
  const menuRef = useRef<HTMLDivElement>(null);
  const depositRef = useRef<HTMLDivElement>(null);
  const withdrawRef = useRef<HTMLDivElement>(null);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowWalletMenu(false);
      }
      if (depositRef.current && !depositRef.current.contains(event.target as Node)) {
        setShowDepositMenu(false);
      }
      if (withdrawRef.current && !withdrawRef.current.contains(event.target as Node)) {
        setShowWithdrawMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Toggle body class when mobile nav opens/closes
  useEffect(() => {
    if (showMobileNav) {
      document.body.classList.add('mobile-nav-open');
    } else {
      document.body.classList.remove('mobile-nav-open');
    }
    return () => {
      document.body.classList.remove('mobile-nav-open');
    };
  }, [showMobileNav]);

  // Close other menus when opening one
  const handleOpenDeposit = () => {
    setShowWithdrawMenu(false);
    setShowWalletMenu(false);
    setShowDepositMenu(!showDepositMenu);
    // Show promo popup for 5 seconds
    if (!showDepositMenu) {
      setShowDepositPromo(true);
      if (depositPromoTimer.current) clearTimeout(depositPromoTimer.current);
      depositPromoTimer.current = setTimeout(() => setShowDepositPromo(false), 5000);
    } else {
      setShowDepositPromo(false);
      if (depositPromoTimer.current) clearTimeout(depositPromoTimer.current);
    }
  };

  const handleOpenWithdraw = () => {
    setShowDepositMenu(false);
    setShowWalletMenu(false);
    setShowWithdrawMenu(!showWithdrawMenu);
  };

  const handleOpenWalletMenu = () => {
    setShowDepositMenu(false);
    setShowWithdrawMenu(false);
    setShowWalletMenu(!showWalletMenu);
  };

  // Format wallet address for display
  const formatAddress = (address: string | null) => {
    if (!address) return '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  // Handle connect button click - directly open Privy login
  const handleConnectClick = () => {
    login();
  };

  // Handle disconnect - logout from Privy (which also disconnects wallet)
  const handleDisconnect = async () => {
    try {
      await logout();
      await disconnectWallet();
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  };

  return (
    <div 
      id="app-hdr"
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      
      {/* Left Section - Logo + Game Nav (non-clickable logo) */}
      <div className="header-logo-container" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <Logo />
        {/* Game Navigation Buttons - Desktop Only */}
        <GameNavButtons />
      </div>

      {/* Center Section - XP Bar + Blitz Carousel (absolutely centered) */}
      {isConnected && xpState && blitz ? (
        <div className="header-center-xp" style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
        }}>
          <BlitzHeaderCarousel xpState={xpState} blitz={blitz} compact />
        </div>
      ) : isConnected && xpState ? (
        <div className="header-center-xp" style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
        }}>
          <BlitzHeaderCarousel xpState={xpState} blitz={null as any} compact />
        </div>
      ) : null}

      {/* Right Section - Wallet */}
      {isConnected ? (
        <>
        {/* Post-Connection Container - .header-section-main-right */}
        <div 
          className="header-section-main-right"
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            columnGap: 12,
            flexShrink: 0,
            boxSizing: 'border-box',
          }}
        >
          {/* CHESTS Button - Golden, left of Withdraw */}
          {onOpenChests && (
            <button
              type="button"
              onClick={onOpenChests}
              className="header-chests-btn"
              style={{
                height: 36,
                borderRadius: 8,
                padding: '0 12px',
                background: '#FFD700',
                border: 'none',
                boxShadow: '#b8960f 0px 4px 0px 0px',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontFamily: "'DynaPuff', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                textTransform: 'uppercase',
                color: 'rgb(13, 14, 18)',
                cursor: 'pointer',
                userSelect: 'none',
                WebkitFontSmoothing: 'antialiased',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(2px)';
                e.currentTarget.style.boxShadow = '#b8960f 0px 2px 0px 0px';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '#b8960f 0px 4px 0px 0px';
              }}
            >
              Chests
            </button>
          )}

          {/* Balance Display Box - Left of Withdraw */}
          {blitz && activeCurrency !== undefined && onCurrencyChange ? (
            <CurrencySelector
              activeCurrency={activeCurrency}
              onCurrencyChange={onCurrencyChange}
              solBalance={depositedBalance}
              csolBalance={blitz.csolBalance}
              isParticipating={blitz.isParticipating}
            />
          ) : (
            <div
              className="header-balance-box"
              style={{
                height: 36,
                borderRadius: 8,
                padding: '0 12px',
                background: '#0d1117',
                border: '1px solid rgba(248, 248, 252, 0.15)',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <img src={solanaLogo} alt="SOL" style={{ width: 20, height: 20 }} />
              <span
                style={{
                  fontFamily: "'DynaPuff', sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#00FFA3',
                  textShadow: '0 0 8px rgba(0, 255, 163, 0.3)',
                }}
              >
                {depositedBalance.toFixed(3)}
              </span>
            </div>
          )}

          {/* Withdraw Button with Dropdown */}
          <div className="relative" ref={withdrawRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={handleOpenWithdraw}
              style={{
                height: 36,
                borderRadius: 8,
                padding: '0 12px',
                background: 'rgb(30, 32, 42)',
                border: '1px solid rgb(55, 65, 81)',
                boxShadow: 'rgba(0, 0, 0, 0.4) 0px 4px 0px 0px',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontFamily: "'DynaPuff', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                textTransform: 'uppercase',
                color: 'rgb(255, 255, 255)',
                cursor: 'pointer',
                userSelect: 'none',
                WebkitFontSmoothing: 'antialiased',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(2px)';
                e.currentTarget.style.boxShadow = 'rgba(0, 0, 0, 0.4) 0px 2px 0px 0px';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'rgba(0, 0, 0, 0.4) 0px 4px 0px 0px';
              }}
            >
              <ArrowUpFromLine size={14} />
              Withdraw
            </button>
            
            {/* Withdraw Dropdown */}
            <TransactionDropdown
              type="withdraw"
              isOpen={showWithdrawMenu}
              onClose={() => setShowWithdrawMenu(false)}
              balance={depositedBalance}
              onTransaction={withdraw}
            />
          </div>
          
          {/* Deposit Button with Dropdown */}
          <div className="relative" ref={depositRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={handleOpenDeposit}
              style={{
                height: 36,
                borderRadius: 8,
                padding: '0 12px',
                background: '#22C55E',
                border: 'none',
                boxShadow: 'rgba(20, 83, 45, 1) 0px 4px 0px 0px',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontFamily: "'DynaPuff', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                textTransform: 'uppercase',
                color: 'rgb(13, 14, 18)',
                cursor: 'pointer',
                userSelect: 'none',
                WebkitFontSmoothing: 'antialiased',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(2px)';
                e.currentTarget.style.boxShadow = 'rgba(20, 83, 45, 1) 0px 2px 0px 0px';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'rgba(20, 83, 45, 1) 0px 4px 0px 0px';
              }}
            >
              <ArrowDownToLine size={14} />
              Deposit
            </button>
            
            {/* Deposit Dropdown */}
            <TransactionDropdown
              type="deposit"
              isOpen={showDepositMenu}
              onClose={() => setShowDepositMenu(false)}
              balance={balance}
              onTransaction={deposit}
            />

            {/* First Deposit Promo Popup */}
            <AnimatePresence>
              {showDepositPromo && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    width: 260,
                    padding: '12px 14px',
                    background: 'linear-gradient(135deg, #1a2a1a 0%, #0d1117 100%)',
                    border: '1px solid #22C55E',
                    borderRadius: 10,
                    boxShadow: '0 4px 20px rgba(34, 197, 94, 0.25)',
                    zIndex: 9999,
                    pointerEvents: 'none',
                  }}
                >
                  <div style={{
                    fontFamily: "'DynaPuff', sans-serif",
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#22C55E',
                    marginBottom: 4,
                    letterSpacing: 0.5,
                  }}>
                    FIRST DEPOSIT BONUS
                  </div>
                  <div style={{
                    fontFamily: "'DynaPuff', sans-serif",
                    fontSize: 11,
                    color: '#e2e8f0',
                    lineHeight: 1.4,
                  }}>
                    Get a 0.5 SOL reward when you deposit 1 SOL or more on your first deposit
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          {/* Username Profile Button - Last element (furthest right) */}
          <div className="relative" ref={menuRef}>
            <button
              id="profile-btn"
              type="button"
              onClick={handleOpenWalletMenu}
              style={{
                height: 36,
                minWidth: 100,
                borderRadius: 8,
                border: '2px solid transparent',
                background: 'linear-gradient(rgb(17, 24, 39), rgb(17, 24, 39)) padding-box, linear-gradient(to right, #3B82F6, #00FFA3) border-box',
                boxShadow: 'rgba(59, 130, 246, 0.5) 0px 4px 12px 0px',
                boxSizing: 'border-box',
                padding: '0 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                columnGap: 8,
                fontFamily: "'DynaPuff', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                textTransform: 'uppercase',
                color: 'rgb(255, 255, 255)',
                cursor: 'pointer',
                userSelect: 'none',
                WebkitFontSmoothing: 'antialiased',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(2px)';
                e.currentTarget.style.boxShadow = 'rgba(59, 130, 246, 0.5) 0px 2px 6px 0px';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'rgba(59, 130, 246, 0.5) 0px 4px 12px 0px';
              }}
            >
              <span>{username || formatAddress(walletAddress)}</span>
              <ChevronDown 
                size={14} 
                style={{
                  transition: 'transform 0.2s ease',
                  transform: showWalletMenu ? 'rotate(180deg)' : 'rotate(0deg)',
                  flexShrink: 0,
                }}
              />
            </button>
          
            {/* Dropdown Menu */}
            <AnimatePresence>
              {showWalletMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    position: 'absolute',
                    right: 0,
                    marginTop: 8,
                    width: 200,
                    background: 'rgb(21, 22, 29)',
                    border: '1px solid rgb(56, 57, 67)',
                    borderRadius: 12,
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
                    overflow: 'hidden',
                    zIndex: 50,
                  }}
                >
                  {/* Balance Header */}
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid rgb(56, 57, 67)' }}>
                    <div style={{ fontSize: 12, color: 'rgba(248, 248, 252, 0.6)', fontFamily: "'DynaPuff', sans-serif" }}>
                      Game Balance
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 600, color: '#00ff88', fontFamily: "'DynaPuff', sans-serif" }}>
                      <img src={solanaLogo} alt="SOL" style={{ width: 24, height: 24 }} />
                      {depositedBalance.toFixed(4)}
                    </div>
                  </div>
                  
                  {/* Wallet Address */}
                  <div style={{ padding: '8px 16px', borderBottom: '1px solid rgb(56, 57, 67)' }}>
                    <div style={{ fontSize: 11, color: 'rgba(248, 248, 252, 0.5)', fontFamily: "'DynaPuff', sans-serif" }}>
                      {formatAddress(walletAddress)}
                    </div>
                  </div>
                  
                  {/* Disconnect */}
                  <button
                    onClick={() => { handleDisconnect(); setShowWalletMenu(false); }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      background: 'transparent',
                      border: 'none',
                      fontFamily: "'DynaPuff', sans-serif",
                      fontSize: 14,
                      color: '#f87171',
                      cursor: 'pointer',
                      transition: 'background 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <LogOut size={16} />
                    Disconnect
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Mobile Hamburger Button */}
        <button
          className="mobile-hamburger-btn"
          onClick={() => setShowMobileNav(true)}
          aria-label="Open menu"
        >
          <Menu />
        </button>

        {/* Mobile Navigation Overlay */}
        <div 
          className={`mobile-nav-overlay ${showMobileNav ? 'open' : ''}`}
          onClick={() => setShowMobileNav(false)}
        />

        {/* Mobile Navigation Menu */}
        <div className={`mobile-nav-menu ${showMobileNav ? 'open' : ''}`}>
          {/* Mobile Nav Header */}
          <div className="mobile-nav-header">
            <span style={{ fontFamily: "'DynaPuff', sans-serif", fontSize: 16, fontWeight: 600, color: 'rgb(248, 248, 252)' }}>
              Menu
            </span>
            <button
              className="mobile-nav-close-btn"
              onClick={() => setShowMobileNav(false)}
              aria-label="Close menu"
            >
              <X />
            </button>
          </div>

          {/* User Info */}
          <div className="mobile-nav-user-info">
            <div className="mobile-nav-username">
              {username || formatAddress(walletAddress)}
            </div>
            <div className="mobile-nav-view-profile">
              <User size={16} />
              View Profile
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mobile-nav-actions">
            <button
              className="mobile-nav-action-btn mobile-nav-withdraw"
              onClick={() => {
                setShowMobileNav(false);
                if (onOpenWithdraw) {
                  onOpenWithdraw();
                } else {
                  setShowMobileWithdraw(true);
                }
              }}
            >
              <ArrowUpFromLine size={14} />
              Withdraw
            </button>
            <button
              className="mobile-nav-action-btn mobile-nav-deposit"
              onClick={() => {
                setShowMobileNav(false);
                if (onOpenDeposit) {
                  onOpenDeposit();
                } else {
                  setShowMobileDeposit(true);
                }
              }}
            >
              <ArrowDownToLine size={14} />
              Deposit
            </button>
          </div>

          {/* Game Navigation Buttons */}
          <div className="mobile-nav-games" style={{ display: 'flex', gap: 8, padding: '0 16px', marginTop: 8 }}>
            <button
              type="button"
              onClick={() => {
                setShowMobileNav(false);
                navigate('/');
              }}
              style={{
                flex: 1,
                height: 40,
                borderRadius: 8,
                background: '#facc15',
                border: 'none',
                fontFamily: "'DynaPuff', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                textTransform: 'uppercase',
                color: 'rgb(13, 14, 18)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                boxShadow: location.pathname === '/' ? 'rgba(250, 204, 21, 0.4) 0px 0px 12px 0px, #b89b10 0px 4px 0px 0px' : '#b89b10 0px 4px 0px 0px',
              }}
            >
              <span>🎰</span>
              <span>Pumpit</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowMobileNav(false);
                navigate('/solpong');
              }}
              style={{
                flex: 1,
                height: 40,
                borderRadius: 8,
                background: '#facc15',
                border: 'none',
                fontFamily: "'DynaPuff', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                textTransform: 'uppercase',
                color: 'rgb(13, 14, 18)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                boxShadow: location.pathname === '/solpong' ? 'rgba(250, 204, 21, 0.4) 0px 0px 12px 0px, #b89b10 0px 4px 0px 0px' : '#b89b10 0px 4px 0px 0px',
              }}
            >
              <span>🏓</span>
              <span>SolPong</span>
            </button>
          </div>

          {/* Chests Button - Mobile */}
          {onOpenChests && (
            <button
              type="button"
              onClick={() => {
                setShowMobileNav(false);
                onOpenChests();
              }}
              style={{
                width: 'calc(100% - 32px)',
                height: 44,
                margin: '8px 16px 0',
                borderRadius: 8,
                background: '#FFD700',
                border: 'none',
                boxShadow: '#b8960f 0px 4px 0px 0px',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontFamily: "'DynaPuff', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                textTransform: 'uppercase',
                color: 'rgb(13, 14, 18)',
                cursor: 'pointer',
                userSelect: 'none',
                WebkitFontSmoothing: 'antialiased',
                transition: 'all 0.15s ease',
              }}
            >
              Chests
            </button>
          )}

          {/* Disconnect Button */}
          <button
            className="mobile-nav-disconnect"
            onClick={() => {
              handleDisconnect();
              setShowMobileNav(false);
            }}
          >
            <LogOut size={18} />
            Disconnect Wallet
          </button>
        </div>
        </>
      ) : (
        /* Connect Wallet Button - #connect-btn */
        <button
          id="connect-btn"
          type="button"
          onClick={handleConnectClick}
          style={{
            height: 36,
            width: 100,
            borderRadius: 8,
            border: '2px solid transparent',
            background: 'linear-gradient(rgb(17, 24, 39), rgb(17, 24, 39)) padding-box, linear-gradient(to right, #3B82F6, #00FFA3) border-box',
            boxShadow: 'rgba(59, 130, 246, 0.5) 0px 4px 12px 0px',
            boxSizing: 'border-box',
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'DynaPuff', sans-serif",
            fontSize: 14,
            fontWeight: 600,
            textTransform: 'uppercase',
            color: 'rgb(255, 255, 255)',
            cursor: 'pointer',
            userSelect: 'none',
            WebkitFontSmoothing: 'antialiased',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(2px)';
            e.currentTarget.style.boxShadow = 'rgba(59, 130, 246, 0.5) 0px 2px 6px 0px';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'rgba(59, 130, 246, 0.5) 0px 4px 12px 0px';
          }}
        >
          Connect
        </button>
      )}
      {/* Mobile Transaction Modals */}
      <MobileTransactionModal
        type="deposit"
        isOpen={showMobileDeposit}
        onClose={() => setShowMobileDeposit(false)}
        balance={balance}
        onTransaction={deposit}
      />
      <MobileTransactionModal
        type="withdraw"
        isOpen={showMobileWithdraw}
        onClose={() => setShowMobileWithdraw(false)}
        balance={depositedBalance}
        onTransaction={withdraw}
      />
    </div>
  );
};

export default GlobalHeader;
