import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * PROPMETRIKPayments v2 — Multi-Token, Multi-Chain Deploy Script
 *
 * Supported networks:
 *   - Ethereum mainnet (1):     deploys contract, adds ETH/USDT/USDC/WBTC
 *   - Polygon mainnet (137):    deploys contract, adds USDT/USDC/USDC.e/WETH/WBTC
 *   - Amoy testnet (80002):     deploys MockERC20s, then contract, adds mocks
 *   - Sepolia testnet (11155111): deploys MockERC20s, then contract, adds mocks
 *   - Hardhat/localhost:        same as testnet
 */

// ── Token Registries per Chain ───────────────────────────────────

interface TokenEntry { address: string; symbol: string; decimals: number }

const ETHEREUM_MAINNET_TOKENS: TokenEntry[] = [
  { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH",  decimals: 18 },
  { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT",  decimals: 6  },
  { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC",  decimals: 6  },
  { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", symbol: "WBTC",  decimals: 8  },
];

const POLYGON_MAINNET_TOKENS: TokenEntry[] = [
  { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", symbol: "USDT",   decimals: 6  },
  { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", symbol: "USDC",   decimals: 6  },
  { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", symbol: "USDC.e", decimals: 6  },
  { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", symbol: "WETH",   decimals: 18 },
  { address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", symbol: "WBTC",   decimals: 8  },
];

// Map chainId → mainnet token list
const MAINNET_REGISTRIES: Record<number, TokenEntry[]> = {
  1:   ETHEREUM_MAINNET_TOKENS,
  137: POLYGON_MAINNET_TOKENS,
};

// ── DEX Swap Routers per Chain ───────────────────────────────────

// QuickSwap V3 on Polygon (Uniswap V3 compatible interface)
// Uniswap V3 on Ethereum
const SWAP_ROUTERS: Record<number, string> = {
  1:   "0xE592427A0AEce92De3Edee1F18E0157C05861564", // Uniswap V3 SwapRouter (Ethereum)
  137: "0xf5b509bB0909a69B1c207E495f687a596C168E12", // QuickSwap V3 SwapRouter (Polygon)
};

// Stablecoin pair fee tiers (0.05% = 500)
interface PairFeeTier { tokenA: string; tokenB: string; tier: number }
const POLYGON_PAIR_TIERS: PairFeeTier[] = [
  // USDT ↔ USDC: 0.05% (deep stablecoin liquidity)
  { tokenA: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", tokenB: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", tier: 500 },
  // USDT ↔ USDC.e: 0.05%
  { tokenA: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", tokenB: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", tier: 500 },
  // USDC ↔ USDC.e: 0.01% (identical peg)
  { tokenA: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", tokenB: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", tier: 100 },
];

// ── WBTC Addresses per Chain (Phase 3: BTC Settlement) ───────────
const WBTC_ADDRESSES: Record<number, string> = {
  1:   "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC on Ethereum
  137: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", // WBTC on Polygon
};

// Mock tokens deployed on any testnet/local chain
const MOCK_TOKENS = [
  { name: "Mock WETH",   symbol: "WETH",   decimals: 18 },
  { name: "Mock USDT",   symbol: "USDT",   decimals: 6  },
  { name: "Mock USDC",   symbol: "USDC",   decimals: 6  },
  { name: "Mock USDC.e", symbol: "USDC.e", decimals: 6  },
  { name: "Mock WBTC",   symbol: "WBTC",   decimals: 8  },
];

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const [deployer] = await ethers.getSigners();
  const isMainnet = chainId in MAINNET_REGISTRIES;
  const chainLabel = chainId === 1 ? "Ethereum" : chainId === 137 ? "Polygon" : network.name;
  const nativeSymbol = chainId === 1 || chainId === 11155111 ? "ETH" : "MATIC";

  console.log("═══════════════════════════════════════════════════");
  console.log("  PROPMETRIK Payments v2 — Multi-Token Deployment ");
  console.log("═══════════════════════════════════════════════════");
  console.log(`Network:   ${chainLabel} / ${network.name} (chainId: ${chainId})`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Balance:   ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ${nativeSymbol}`);
  console.log(`Mode:      ${isMainnet ? "MAINNET" : "TESTNET / LOCAL"}`);
  console.log("");

  // ── Safe multisig address ──────────────────────────────────────
  const SAFE_WALLET = process.env.SAFE_WALLET_ADDRESS;
  if (!SAFE_WALLET || !ethers.isAddress(SAFE_WALLET)) {
    throw new Error("SAFE_WALLET_ADDRESS must be set to a valid address");
  }
  console.log(`Safe/Owner: ${SAFE_WALLET}`);

  // Registrar = backend signer that can register recipients & attest off-chain payments
  // On testnet the deployer doubles as registrar; on mainnet use a dedicated key.
  const REGISTRAR_ADDRESS = process.env.BTC_RELAYER_ADDRESS || deployer.address;
  if (!ethers.isAddress(REGISTRAR_ADDRESS)) {
    throw new Error("BTC_RELAYER_ADDRESS (registrar) must be a valid address");
  }

  // ── Deploy mock tokens if testnet ──────────────────────────────
  const tokenAddresses: TokenEntry[] = [];

  if (!isMainnet) {
    console.log("\n🪙  Deploying mock tokens...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");

    for (const mock of MOCK_TOKENS) {
      const token = await MockERC20.deploy(mock.name, mock.symbol, mock.decimals);
      await token.waitForDeployment();
      const addr = await token.getAddress();
      tokenAddresses.push({ address: addr, symbol: mock.symbol, decimals: mock.decimals });
      console.log(`  ${mock.symbol.padEnd(8)} → ${addr}  (${mock.decimals} decimals)`);
    }
  } else {
    tokenAddresses.push(...MAINNET_REGISTRIES[chainId]);
    console.log(`\n🪙  Using ${chainLabel} mainnet token addresses:`);
    for (const t of tokenAddresses) {
      console.log(`  ${t.symbol.padEnd(8)} → ${t.address}  (${t.decimals} dec)`);
    }
  }

  // ── Deploy PROPMETRIKPayments ──────────────────────────────────
  // Always deploy with deployer as owner so we can call onlyOwner setup functions.
  // On mainnet, ownership is transferred to the Safe multisig after configuration.
  console.log("\n📋 Deploying PROPMETRIKPayments...");
  const PaymentsFactory = await ethers.getContractFactory("PROPMETRIKPayments");
  const payments = await PaymentsFactory.deploy(SAFE_WALLET, deployer.address);
  await payments.waitForDeployment();
  const paymentsAddr = await payments.getAddress();
  console.log(`  Contract → ${paymentsAddr}`);

  // ── Add tokens to allowlist ────────────────────────────────────
  console.log("\n🔗 Adding tokens to allowlist...");
  for (const t of tokenAddresses) {
    const tx = await payments.addToken(t.address, t.symbol, t.decimals);
    await tx.wait();
    console.log(`  ✓ ${t.symbol} added`);
  }

  // ── BTC Support ────────────────────────────────────────────────
  // BTC payments are handled off-chain via NOWPayments.
  // The backend attests BTC payments on-chain via recordOffChainPayment()
  // using the registrar role. No addExternalChain or authorizeRelayer needed.
  console.log("\n₿  BTC support: enabled via off-chain attestation (recordOffChainPayment)");
  console.log("   Backend (registrar) attests BTC payments on-chain for audit trail");

  // ── Authorize registrar(s) ─────────────────────────────────────
  // 1. Deployer key — used by the backend for auto-registering landlords
  console.log(`\n📋 Authorizing registrar (deployer): ${deployer.address}`);
  const registrarTx = await payments.authorizeRegistrar(deployer.address);
  await registrarTx.wait();
  console.log("  ✓ Deployer registrar authorized (backend can auto-register recipients)");

  // 2. Dedicated registrar key — for BTC attestation (if different from deployer)
  if (REGISTRAR_ADDRESS.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log(`  Authorizing registrar (BTC attestation): ${REGISTRAR_ADDRESS}`);
    const btcRegTx = await payments.authorizeRegistrar(REGISTRAR_ADDRESS);
    await btcRegTx.wait();
    console.log("  ✓ BTC registrar authorized");
  }

  // ── Configure DEX Swap Router ──────────────────────────────────
  const swapRouterAddr = SWAP_ROUTERS[chainId];
  if (swapRouterAddr) {
    console.log(`\n🔄 Setting DEX swap router: ${swapRouterAddr}`);
    const swapTx = await payments.setSwapRouter(swapRouterAddr);
    await swapTx.wait();
    console.log("  ✓ Swap router configured");

    // Set stablecoin pair fee tiers on Polygon
    if (chainId === 137) {
      console.log("\n⚙️  Setting stablecoin pair fee tiers...");
      for (const pair of POLYGON_PAIR_TIERS) {
        const tx = await payments.setPairSwapFeeTier(pair.tokenA, pair.tokenB, pair.tier);
        await tx.wait();
        // Also set reverse direction
        const tx2 = await payments.setPairSwapFeeTier(pair.tokenB, pair.tokenA, pair.tier);
        await tx2.wait();
        console.log(`  ✓ ${pair.tokenA.slice(0, 8)}... ↔ ${pair.tokenB.slice(0, 8)}... → tier ${pair.tier}`);
      }
    }
  } else {
    console.log("\n⚠️  No DEX swap router configured for this network");
  }

  // ── WBTC is already in the token allowlist ────────────────────
  // WBTC on-chain payments use processPayment() like any other ERC20.
  // No separate setWbtcToken/setBtcSettlementWallet calls needed.
  const wbtcAddr = WBTC_ADDRESSES[chainId];
  if (wbtcAddr) {
    console.log(`\n₿  WBTC on-chain payments: enabled (${wbtcAddr} in token allowlist)`);
  } else {
    console.log("\n⚠️  No WBTC address for this network");
  }

  // ── Transfer ownership to Safe on mainnet ─────────────────────
  if (isMainnet) {
    console.log(`\n🔐 Transferring ownership to Safe multisig: ${SAFE_WALLET}`);
    const transferTx = await payments.transferOwnership(SAFE_WALLET);
    await transferTx.wait();
    console.log("  ✓ transferOwnership() called — Safe must call acceptOwnership()");
    console.log("  ⚠️  IMPORTANT: Go to Safe UI and call acceptOwnership() to finalize!");
  }

  // ── Save deployment info ───────────────────────────────────────
  const finalOwner = isMainnet ? SAFE_WALLET : deployer.address;
  const deployment = {
    version: "2.3.0-full-cross-currency",
    network: network.name,
    chainId,
    deployer: deployer.address,
    initialOwner: finalOwner,
    propmetrikWallet: SAFE_WALLET,
    contract: paymentsAddr,
    tokens: tokenAddresses,
    registrar: REGISTRAR_ADDRESS,
    swapRouter: swapRouterAddr || null,
    wbtcToken: wbtcAddr || null,

    timestamp: new Date().toISOString(),
  };

  const outDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${network.name}-deployment.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log(`\n💾 Deployment saved to ${outFile}`);

  // ── Summary ────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Deployment Complete!");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Contract:  ${paymentsAddr}`);
  console.log(`  Tokens:    ${tokenAddresses.length} ERC20 configured`);
  console.log(`  BTC:       enabled (off-chain attestation via registrar)`);
  console.log(`  Registrar: ${REGISTRAR_ADDRESS}`);
  console.log(`  Owner:     ${isMainnet ? SAFE_WALLET + " (pending acceptOwnership)" : deployer.address}`);
  console.log("═══════════════════════════════════════════════════");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
