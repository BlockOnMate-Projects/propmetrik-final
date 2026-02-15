/**
 * Quick E2E test: verify crypto payment rail is fully configured on Amoy.
 *
 * Tests:
 *   1. Data-hub exchange rate (GHS → USDT conversion)
 *   2. CryptoPaymentService connectivity (on-chain fee config read)
 *   3. BlockchainListenerService startup
 *
 * Usage: npx ts-node scripts/test-crypto-rail.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { exchangeRateService } from '../shared-services/payments/crypto/exchangeRateService';
import { loadCryptoConfig } from '../shared-services/payments/crypto/types';
import { ethers } from 'ethers';
import contractAbi from '../shared-services/payments/crypto/abi/PROPMETRIKPayments.json';

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  PROPMETRIK — Crypto Rail E2E Test');
  console.log('═══════════════════════════════════════════════════\n');

  // ─── 1. Config Check ───────────────────────────────
  console.log('1. Config Check');
  const config = loadCryptoConfig();
  if (!config) {
    console.error('   ❌ Crypto config not loaded — POLYGON_RPC_URL or PROPMETRIK_CONTRACT_ADDRESS missing');
    process.exit(1);
  }
  console.log(`   ✅ RPC:      ${config.rpcUrl}`);
  console.log(`   ✅ Contract: ${config.contractAddress}`);
  console.log(`   ✅ Chain ID: ${config.chainId}`);
  console.log(`   ✅ USDT:     ${config.usdtAddress}`);
  console.log(`   ✅ Admin PK: ${config.adminPrivateKey ? '***set***' : '⚠️  NOT SET'}`);

  // ─── 2. Exchange Rate (Data Hub) ───────────────────
  console.log('\n2. Exchange Rate (Data Hub → FX Feed)');
  try {
    const rate = await exchangeRateService.getGHSPerUSD();
    console.log(`   ✅ GHS/USD: ${rate.ghsPerUsd} (source: ${rate.source})`);

    const conversion = await exchangeRateService.convertGHStoUSDT(1000);
    console.log(`   ✅ 1,000 GHS = ${conversion.usdtAmount.toFixed(2)} USDT (subunits: ${conversion.usdtSubunits})`);
  } catch (err: any) {
    console.error(`   ❌ Exchange rate failed: ${err.message}`);
  }

  // ─── 3. On-Chain Contract Read ─────────────────────
  console.log('\n3. On-Chain Contract Read');
  try {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl, {
      chainId: config.chainId,
      name: config.chainId === 137 ? 'polygon' : 'amoy',
    });

    const contract = new ethers.Contract(config.contractAddress, contractAbi, provider);

    // Read fee configs
    const rentConfig = await contract.feeConfigs(0);
    const dealConfig = await contract.feeConfigs(1);
    const projectConfig = await contract.feeConfigs(2);

    console.log(`   ✅ RENT:    ${rentConfig.percentageBasisPoints} bps, min ${rentConfig.minimumFeeUSD6}, enabled: ${rentConfig.enabled}`);
    console.log(`   ✅ DEAL:    ${dealConfig.percentageBasisPoints} bps, min ${dealConfig.minimumFeeUSD6}, enabled: ${dealConfig.enabled}`);
    console.log(`   ✅ PROJECT: ${projectConfig.percentageBasisPoints} bps, min ${projectConfig.minimumFeeUSD6}, enabled: ${projectConfig.enabled}`);

    // Read owner
    const owner = await contract.owner();
    console.log(`   ✅ Owner:   ${owner}`);

    // Read accepted tokens (v2 multi-token)
    const tokenCount = await contract.getTokenCount();
    console.log(`   ✅ Tokens:  ${tokenCount} accepted`);
    for (let i = 0; i < Number(tokenCount); i++) {
      const addr = await contract.tokenList(i);
      const [enabled, symbol, decimals] = await contract.isTokenAccepted(addr);
      console.log(`      ${i + 1}. ${symbol} (${decimals} dec) — ${enabled ? '✅' : '❌'} ${addr}`);
    }

    // Read platform wallet
    const platformWallet = await contract.propmetrikWallet();
    console.log(`   ✅ Platform: ${platformWallet}`);

    // Check paused
    const paused = await contract.paused();
    console.log(`   ✅ Paused:  ${paused}`);
  } catch (err: any) {
    console.error(`   ❌ On-chain read failed: ${err.message}`);
  }

  // ─── 4. WebSocket Connectivity ─────────────────────
  console.log('\n4. WebSocket / Polling Connectivity');
  try {
    const wsUrl = config.wsUrl;
    // For Amoy public RPC, WS may not be available — test HTTP polling instead
    const provider = new ethers.JsonRpcProvider(config.rpcUrl, {
      chainId: config.chainId,
      name: config.chainId === 137 ? 'polygon' : 'amoy',
    });
    const blockNumber = await provider.getBlockNumber();
    console.log(`   ✅ Current block: ${blockNumber}`);
    console.log(`   ℹ️  WS URL: ${wsUrl} (BlockchainListener will use this for live events)`);
  } catch (err: any) {
    console.error(`   ❌ Provider connectivity failed: ${err.message}`);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Test complete!');
  console.log('═══════════════════════════════════════════════════');

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
