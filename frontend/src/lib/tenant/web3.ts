/**
 * Web3 / Wagmi Configuration
 * Configures wallet connection for USDT payments on Polygon.
 */

import { http, createConfig } from 'wagmi';
import { polygon, polygonAmoy } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

export const wagmiConfig = createConfig({
  chains: [polygon, polygonAmoy],
  connectors: [
    injected(),
    ...(walletConnectProjectId
      ? [walletConnect({ projectId: walletConnectProjectId })]
      : []),
  ],
  transports: {
    [polygon.id]: http(process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com'),
    [polygonAmoy.id]: http(process.env.NEXT_PUBLIC_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology'),
  },
});

export const USDT_ADDRESS = (process.env.NEXT_PUBLIC_USDT_ADDRESS || '0xc2132D05D31c914a87C6611C10748AEb04B58e8F') as `0x${string}`;

export const PROPMETRIK_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PROPMETRIK_CONTRACT as `0x${string}` | undefined;

export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export const PROPMETRIK_PAYMENTS_ABI = [
  {
    name: 'processPayment',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_paymentType', type: 'uint8' },
      { name: '_recipientEntityId', type: 'bytes32' },
      { name: '_amount', type: 'uint256' },
      { name: '_paymentReference', type: 'bytes32' },
      { name: '_metadata', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;
