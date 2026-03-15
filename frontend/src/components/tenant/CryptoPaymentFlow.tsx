'use client';

/**
 * CryptoPaymentFlow — Unified Multi-Coin Payment Component
 *
 * Supports two payment routes:
 * A) ON-CHAIN (Polygon ERC-20 tokens): Connect wallet → Approve → processPayment() on smart contract
 * B) NOWPAYMENTS (BTC, ETH, SOL, LTC, etc.): Select coin → Get deposit address → Send crypto → Poll status
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useSwitchChain,
} from 'wagmi';
import { polygon, polygonAmoy } from 'viem/chains';
import { formatUnits } from 'viem';
import {
  USDT_ADDRESS,
  ERC20_ABI,
  PROPMETRIK_PAYMENTS_ABI,
} from '@/lib/tenant/web3';
import {
  getSettlementCoins,
  getCryptoEstimate,
  initiateUnifiedCrypto,
  getNowPaymentsStatus,
  initiateCryptoPayment,
  verifyCryptoPayment,
  SettlementCoin,
  CryptoEstimate,
  UnifiedCryptoResult,
  CryptoInitResult,
} from '@/lib/tenant/api';

interface CryptoPaymentFlowProps {
  tenancyId: string;
  amountGHS: number;
  scheduleIds?: string[];
  onSuccess: (result: { txHash: string; principalUSDT: number; feeUSDT: number }) => void;
  onCancel: () => void;
}

type FlowStep =
  | 'select-coin'
  | 'estimate'
  | 'connect'
  | 'preview'
  | 'approve'
  | 'pay'
  | 'deposit'
  | 'polling'
  | 'confirming'
  | 'success'
  | 'error';

function getCoinIconUrl(symbol: string): string {
  const s = symbol.toLowerCase();
  return `https://assets.coincap.io/assets/icons/${s}@2x.png`;
}

function CoinIcon({ symbol, logoUrl, size = 24 }: { symbol: string; logoUrl?: string | null; size?: number }) {
  const [imgError, setImgError] = React.useState(false);
  const [useFallback, setUseFallback] = React.useState(false);
  const s = symbol.toLowerCase();

  const primarySrc = logoUrl || getCoinIconUrl(s);
  const fallbackSrc = logoUrl ? getCoinIconUrl(s) : null;

  if (imgError && (!fallbackSrc || useFallback)) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600 flex-shrink-0"
        style={{ width: size, height: size }}
      >
        {symbol.toUpperCase().slice(0, 3)}
      </span>
    );
  }

  return (
    <img
      src={imgError && fallbackSrc ? fallbackSrc : primarySrc}
      alt={symbol}
      width={size}
      height={size}
      className="rounded-full flex-shrink-0"
      onError={() => {
        if (!imgError) setImgError(true);
        else setUseFallback(true);
      }}
    />
  );
}

export default function CryptoPaymentFlow({
  tenancyId,
  amountGHS,
  scheduleIds,
  onSuccess,
  onCancel,
}: CryptoPaymentFlowProps) {
  const [step, setStep] = useState<FlowStep>('select-coin');
  const [error, setError] = useState<string | null>(null);

  const [coins, setCoins] = useState<SettlementCoin[]>([]);
  const [coinsLoading, setCoinsLoading] = useState(true);
  const [selectedCoin, setSelectedCoin] = useState<SettlementCoin | null>(null);

  const [estimate, setEstimate] = useState<CryptoEstimate | null>(null);

  const [unifiedResult, setUnifiedResult] = useState<UnifiedCryptoResult | null>(null);

  const [initData, setInitData] = useState<CryptoInitResult | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const [nowPayStatus, setNowPayStatus] = useState<string>('waiting');
  const [copied, setCopied] = useState(false);

  const { address, isConnected, chain } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const isTestnet = process.env.NEXT_PUBLIC_PROPMETRIK_CHAIN_ID === '80002';
  const targetChain = isTestnet ? polygonAmoy : polygon;

  useEffect(() => {
    getSettlementCoins()
      .then(setCoins)
      .catch(() => setCoins([]))
      .finally(() => setCoinsLoading(false));
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleCoinSelect = useCallback(async (coin: SettlementCoin) => {
    setSelectedCoin(coin);
    setError(null);
    setStep('estimate');

    try {
      const est = await getCryptoEstimate(amountGHS, coin.nowpayments_ticker, coin.chain, tenancyId);
      setEstimate(est);

      if (est.error) {
        setError(`Estimate error: ${est.error}`);
        setStep('error');
        return;
      }

      if (est.isBelowMinimum) {
        setError(`Amount is below the minimum for ${coin.display_name}. Minimum: ${est.minimumPayAmount} ${coin.coin_symbol.toUpperCase()}`);
        setStep('error');
        return;
      }

      if (coin.is_evm_native) {
        setStep(isConnected ? 'preview' : 'connect');
      } else {
        setStep('preview');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to get estimate');
      setStep('error');
    }
  }, [amountGHS, isConnected, tenancyId]);

  useEffect(() => {
    if (isConnected && address && step === 'connect' && selectedCoin?.is_evm_native) {
      if (chain?.id !== targetChain.id) {
        try { switchChain({ chainId: targetChain.id }); } catch {}
      }
      setStep('preview');
    }
  }, [isConnected, address, step, selectedCoin, chain?.id, targetChain.id, switchChain]);

  const handleInitiate = useCallback(async () => {
    if (!selectedCoin) return;
    setError(null);

    try {
      if (selectedCoin.is_evm_native && address) {
        setStep('approve');
        const result = await initiateCryptoPayment(
          tenancyId,
          amountGHS,
          address,
          scheduleIds,
        );
        setInitData(result);
      } else {
        setStep('deposit');
        const result = await initiateUnifiedCrypto({
          tenancyId,
          amount: amountGHS,
          payerCurrency: selectedCoin.nowpayments_ticker,
          payerChain: selectedCoin.chain,
          scheduleIds,
        });
        setUnifiedResult(result);

        if (result.route === 'nowpayments' && result.nowPaymentsResult) {
          startPolling(result.nowPaymentsResult.paymentId);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to initiate payment');
      setStep('error');
    }
  }, [selectedCoin, address, tenancyId, amountGHS, scheduleIds]);

  const startPolling = useCallback((paymentId: number) => {
    setNowPayStatus('waiting');
    setStep('deposit');

    pollRef.current = setInterval(async () => {
      try {
        const status = await getNowPaymentsStatus(paymentId);
        setNowPayStatus(status.status);

        if (status.status === 'finished' || status.status === 'confirmed') {
          if (pollRef.current) clearInterval(pollRef.current);
          setStep('success');
          onSuccess({
            txHash: `nowpay-${paymentId}`,
            principalUSDT: status.outcomeAmount || 0,
            feeUSDT: 0,
          });
        } else if (status.status === 'failed' || status.status === 'expired' || status.status === 'refunded') {
          if (pollRef.current) clearInterval(pollRef.current);
          setError(`Payment ${status.status}. Please try again.`);
          setStep('error');
        }
      } catch {}
    }, 10_000);
  }, [onSuccess]);

  // On-Chain: Approve ERC-20
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: isApproving,
    error: approveError,
  } = useWriteContract();

  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveHash });

  const { data: currentAllowance } = useReadContract({
    address: USDT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: initData ? [address!, initData.contractAddress as `0x${string}`] : undefined,
    query: { enabled: !!initData && !!address },
  });

  const { data: usdtBalance } = useReadContract({
    address: USDT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!selectedCoin?.is_evm_native },
  });

  useEffect(() => {
    if (step === 'approve' && initData) {
      if (currentAllowance && BigInt(currentAllowance.toString()) >= BigInt(initData.totalSubunits)) {
        setStep('pay');
        return;
      }
      writeApprove({
        address: USDT_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [
          initData.contractAddress as `0x${string}`,
          BigInt(initData.totalSubunits),
        ],
      });
    }
  }, [initData, step, currentAllowance, writeApprove]);

  useEffect(() => {
    if (isApproveConfirmed && step === 'approve') setStep('pay');
  }, [isApproveConfirmed, step]);

  useEffect(() => {
    if (approveError) {
      setError(`Approval failed: ${approveError.message}`);
      setStep('error');
    }
  }, [approveError]);

  // On-Chain: Process Payment
  const {
    writeContract: writePayment,
    data: paymentHash,
    isPending: isPaying,
    error: paymentError,
  } = useWriteContract();

  const { isLoading: isPayConfirming, isSuccess: isPayConfirmed } =
    useWaitForTransactionReceipt({ hash: paymentHash });

  useEffect(() => {
    if (step === 'pay' && initData && !isPaying && !paymentHash) {
      writePayment({
        address: initData.contractAddress as `0x${string}`,
        abi: PROPMETRIK_PAYMENTS_ABI,
        functionName: 'processPayment',
        args: [
          initData.contractPaymentType,
          initData.recipientEntityId as `0x${string}`,
          BigInt(initData.principalSubunits),
          initData.referenceHash as `0x${string}`,
          initData.abiEncodedMetadata as `0x${string}`,
        ],
      });
    }
  }, [step, initData, isPaying, paymentHash, writePayment]);

  useEffect(() => {
    if (isPayConfirmed && paymentHash) {
      setStep('confirming');
      setTxHash(paymentHash);

      verifyCryptoPayment(paymentHash)
        .then((result) => {
          if (result.success) {
            setStep('success');
            onSuccess({
              txHash: paymentHash,
              principalUSDT: result.principalUSDT || initData?.principalUSDT || 0,
              feeUSDT: result.feeUSDT || initData?.feeUSDT || 0,
            });
          } else {
            setError(result.error || 'Verification failed');
            setStep('error');
          }
        })
        .catch(() => {
          setStep('success');
          onSuccess({
            txHash: paymentHash,
            principalUSDT: initData?.principalUSDT || 0,
            feeUSDT: initData?.feeUSDT || 0,
          });
        });
    }
  }, [isPayConfirmed, paymentHash, initData, onSuccess]);

  useEffect(() => {
    if (paymentError) {
      setError(`Payment failed: ${paymentError.message}`);
      setStep('error');
    }
  }, [paymentError]);

  const balanceFormatted = usdtBalance
    ? parseFloat(formatUnits(BigInt(usdtBalance.toString()), 6)).toFixed(2)
    : null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [coinSearch, setCoinSearch] = useState('');

  const onChainCoins = coins.filter(c => c.is_evm_native);
  const allOffChainCoins = coins.filter(c => !c.is_evm_native);

  const offChainCoins = coinSearch.trim()
    ? allOffChainCoins.filter(c =>
        c.coin_symbol.toLowerCase().includes(coinSearch.toLowerCase()) ||
        (c.display_name || '').toLowerCase().includes(coinSearch.toLowerCase()) ||
        (c.chain || '').toLowerCase().includes(coinSearch.toLowerCase())
      )
    : allOffChainCoins;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          {step === 'select-coin' ? 'Pay with Crypto' : `Pay with ${selectedCoin?.coin_symbol.toUpperCase() || 'Crypto'}`}
        </h3>
        <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
      </div>

      {step === 'select-coin' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Choose which cryptocurrency you&apos;d like to pay GH₵{amountGHS.toLocaleString()} with:
          </p>

          {coinsLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin h-5 w-5 border-2 border-cyan-600 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="space-y-3">
              {onChainCoins.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    On-Chain (Polygon) — Direct Settlement
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {onChainCoins.map(coin => (
                      <button
                        key={coin.id}
                        onClick={() => handleCoinSelect(coin)}
                        className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:border-cyan-400 hover:bg-cyan-50 transition-all"
                      >
                        <CoinIcon symbol={coin.coin_symbol} logoUrl={coin.logo_url} size={24} />
                        <div className="text-left">
                          <span className="block font-semibold text-gray-900">{coin.coin_symbol.toUpperCase()}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {allOffChainCoins.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    {allOffChainCoins.length}+ Coins — via NOWPayments
                  </p>
                  <div className="relative mb-2">
                    <input
                      type="text"
                      placeholder="Search coins (BTC, ETH, SOL...)"
                      value={coinSearch}
                      onChange={e => setCoinSearch(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 pl-8"
                    />
                    <svg className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-100">
                    <div className="grid grid-cols-2 gap-1.5 p-1.5">
                      {offChainCoins.slice(0, 100).map(coin => (
                        <button
                          key={coin.id}
                          onClick={() => handleCoinSelect(coin)}
                          className="flex items-center gap-2 px-2.5 py-2 border border-gray-100 rounded-lg text-sm font-medium hover:border-purple-400 hover:bg-purple-50 transition-all"
                        >
                          <CoinIcon symbol={coin.coin_symbol} logoUrl={coin.logo_url} size={20} />
                          <div className="text-left min-w-0">
                            <span className="block font-semibold text-gray-900 text-xs">{coin.coin_symbol.toUpperCase()}</span>
                            <span className="block text-[9px] text-gray-400 truncate">{coin.chain}</span>
                          </div>
                        </button>
                      ))}
                      {offChainCoins.length === 0 && coinSearch && (
                        <p className="col-span-2 text-center text-xs text-gray-400 py-3">No coins match &quot;{coinSearch}&quot;</p>
                      )}
                    </div>
                  </div>
                  {offChainCoins.length > 100 && (
                    <p className="text-[10px] text-gray-400 mt-1 text-center">Showing first 100 results. Use search to find more.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {step === 'estimate' && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="animate-spin h-5 w-5 border-2 border-cyan-600 border-t-transparent rounded-full" />
          <span className="text-sm text-gray-600">Getting {selectedCoin?.coin_symbol.toUpperCase()} conversion rate...</span>
        </div>
      )}

      {step === 'connect' && !isConnected && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Connect your wallet to pay with {selectedCoin?.coin_symbol.toUpperCase()} on Polygon.
          </p>
          <div className="grid gap-2">
            {connectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={() => connect({ connector })}
                className="flex items-center gap-3 w-full px-4 py-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm font-medium">{connector.name}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => { setStep('select-coin'); setSelectedCoin(null); setEstimate(null); }}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            ← Pick a different coin
          </button>
        </div>
      )}

      {step === 'preview' && estimate && selectedCoin && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="text-sm text-blue-800 space-y-2">
              <div className="flex justify-between">
                <span>Rent Amount</span>
                <span className="font-semibold">GH₵{amountGHS.toLocaleString()}</span>
              </div>
              {estimate.platformFeeGhs > 0 && (
                <div className="flex justify-between text-xs text-blue-600">
                  <span>Platform Fee</span>
                  <span>GH₵{Number(estimate.platformFeeGhs).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Total ({estimate.platformFeeGhs > 0 ? 'incl. fee' : 'rent'})</span>
                <span className="font-semibold">GH₵{Number(estimate.totalChargeGhs || amountGHS).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs text-blue-600">
                <span>USD Equivalent</span>
                <span>${Number(estimate.totalChargeUsd || estimate.amountUsd).toFixed(2)}</span>
              </div>
              <hr className="border-blue-200" />
              <div className="flex justify-between text-base font-bold text-blue-900">
                <span>You Pay</span>
                <span>
                  {Number(estimate.estimatedPayAmount).toFixed(
                    Number(estimate.estimatedPayAmount) < 1 ? 8 : Number(estimate.estimatedPayAmount) < 100 ? 4 : 2
                  )}{' '}
                  {selectedCoin.coin_symbol.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {selectedCoin.is_evm_native && balanceFormatted && (
            <p className="text-xs text-gray-500">
              Your balance: <span className="font-medium">{balanceFormatted} USDT</span>
            </p>
          )}

          <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600">
            {selectedCoin.is_evm_native ? (
              <p>Settles directly via the PROPMETRIK smart contract on Polygon. Your wallet will prompt you to approve the token spend, then submit the payment.</p>
            ) : (
              <p>You&apos;ll get a deposit address to send {selectedCoin.coin_symbol.toUpperCase()} to. NOWPayments converts it and settles to your landlord&apos;s preferred currency automatically.</p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setStep('select-coin'); setSelectedCoin(null); setEstimate(null); }}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleInitiate}
              className="flex-1 px-4 py-2.5 bg-cyan-600 text-white rounded-xl font-medium hover:bg-cyan-700"
            >
              {selectedCoin.is_evm_native ? 'Approve & Pay' : 'Get Deposit Address'}
            </button>
          </div>
        </div>
      )}

      {step === 'deposit' && unifiedResult?.nowPaymentsResult && selectedCoin && (
        <div className="space-y-4">
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
            <div className="text-center">
              <p className="text-sm font-medium text-purple-900">
                Send exactly{' '}
                <span className="text-lg font-bold">
                  {unifiedResult.nowPaymentsResult.payAmount}{' '}
                  {unifiedResult.nowPaymentsResult.payCurrency.toUpperCase()}
                </span>
              </p>
              <p className="text-xs text-purple-700 mt-1">to this address:</p>
            </div>

            <div className="bg-white rounded-lg p-3 border border-purple-200">
              <div className="flex justify-center mb-3">
                <div className="bg-white p-2 rounded-lg">
                  <QRCodeSVG
                    value={unifiedResult.nowPaymentsResult.depositAddress}
                    size={160}
                    level="H"
                    includeMargin={false}
                    bgColor="#ffffff"
                    fgColor="#1e1b4b"
                  />
                </div>
              </div>
              <p className="text-xs font-mono break-all text-gray-900 text-center">
                {unifiedResult.nowPaymentsResult.depositAddress}
              </p>
              <button
                onClick={() => copyToClipboard(unifiedResult.nowPaymentsResult!.depositAddress)}
                className="mt-2 w-full text-xs text-purple-600 hover:text-purple-700 font-medium"
              >
                {copied ? '✓ Copied!' : 'Copy Address'}
              </button>
            </div>

            <div className="flex items-center gap-2 justify-center text-xs text-purple-700">
              <div className="animate-pulse w-2 h-2 bg-purple-500 rounded-full" />
              <span>
                {nowPayStatus === 'waiting' ? 'Waiting for your transaction...' :
                 nowPayStatus === 'partially_paid' ? 'Partial payment received — send remaining amount' :
                 nowPayStatus === 'confirming' ? 'Transaction detected — confirming...' :
                 nowPayStatus === 'sending' ? 'Converting and sending to landlord...' :
                 `Status: ${nowPayStatus}`}
              </span>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-800">
              <strong>Important:</strong> Send the exact amount shown. The deposit address is single-use.
              This page will update automatically once your payment is detected.
            </p>
          </div>
        </div>
      )}

      {step === 'approve' && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="animate-spin h-8 w-8 border-3 border-cyan-600 border-t-transparent rounded-full" />
          <p className="text-sm text-gray-600">
            {isApproving ? 'Confirm approval in your wallet...' :
             isApproveConfirming ? 'Waiting for approval confirmation...' :
             'Preparing payment...'}
          </p>
        </div>
      )}

      {step === 'pay' && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="animate-spin h-8 w-8 border-3 border-cyan-600 border-t-transparent rounded-full" />
          <p className="text-sm text-gray-600">
            {isPaying ? 'Confirm payment in your wallet...' :
             isPayConfirming ? 'Waiting for on-chain confirmation...' :
             'Submitting payment...'}
          </p>
        </div>
      )}

      {step === 'confirming' && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="animate-spin h-8 w-8 border-3 border-green-600 border-t-transparent rounded-full" />
          <p className="text-sm text-gray-600">Verifying payment...</p>
        </div>
      )}

      {step === 'success' && (
        <div className="text-center py-6 space-y-3">
          <div className="mx-auto w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h4 className="text-lg font-semibold text-emerald-900">Payment Successful!</h4>
          <p className="text-sm text-gray-600">
            {selectedCoin?.coin_symbol.toUpperCase()} payment has been processed.
          </p>
          {txHash && !txHash.startsWith('nowpay-') && (
            <a
              href={`https://${isTestnet ? 'amoy.' : ''}polygonscan.com/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-cyan-600 hover:underline"
            >
              View on PolygonScan →
            </a>
          )}
        </div>
      )}

      {step === 'error' && (
        <div className="space-y-3">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm text-red-800">{error || 'An unexpected error occurred'}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setError(null);
                setStep('select-coin');
                setSelectedCoin(null);
                setEstimate(null);
                setUnifiedResult(null);
                setInitData(null);
                if (pollRef.current) clearInterval(pollRef.current);
              }}
              className="flex-1 px-4 py-2.5 bg-gray-800 text-white rounded-xl hover:bg-gray-900"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {isConnected && address && selectedCoin?.is_evm_native && step !== 'select-coin' && step !== 'success' && (
        <div className="text-xs text-gray-400 text-center">
          Connected: {address.slice(0, 6)}...{address.slice(-4)} on {chain?.name || 'Unknown'}
        </div>
      )}
    </div>
  );
}
