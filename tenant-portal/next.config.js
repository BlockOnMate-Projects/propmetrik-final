const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  },
  webpack: (config) => {
    // wagmi@3 / @wagmi/connectors@7 bundles ALL connector code (Porto, Coinbase,
    // Safe, Gemini, MetaMask SDK, etc.) even though we only use injected + walletConnect.
    // Their optional peer deps aren't installed, so webpack fails to resolve them.
    // Alias them to false so webpack treats them as empty/external modules.
    config.resolve.alias = {
      ...config.resolve.alias,
      'porto': false,
      'porto/internal': false,
      '@coinbase/wallet-sdk': false,
      '@base-org/account': false,
      '@safe-global/safe-apps-sdk': false,
      '@safe-global/safe-apps-provider': false,
      '@gemini-wallet/core': false,
      '@metamask/sdk': false,
    };
    return config;
  },
}

module.exports = nextConfig
