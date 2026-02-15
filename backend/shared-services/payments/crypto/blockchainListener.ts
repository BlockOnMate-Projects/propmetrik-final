/**
 * Blockchain Listener Service
 * Subscribes to PaymentProcessed events (v2 multi-token) via WebSocket and
 * reconciles them with payment_transactions in the DB.
 *
 * Crash recovery:
 *   On startup, reads `last_processed_block` from `blockchain_sync_state`
 *   and replays any missed blocks since the last checkpoint.
 *
 * Design:
 *   - Uses ethers.js v6 WebSocketProvider for real-time event subscription
 *   - Falls back to polling via JsonRpcProvider if WS is unavailable
 *   - Updates blockchain_sync_state after each batch of events
 *   - Graceful shutdown via stop() method
 *   - v2: captures token address from PaymentProcessed events
 *
 * @module shared-services/payments/crypto/blockchainListener
 */

import { ethers } from 'ethers';
import { pool } from '../../../src/database';
import { logger } from '../../../src/utils/logger';
import { CryptoPaymentEvent, loadCryptoConfig } from './types';
import contractArtifact from './abi/PROPMETRIKPayments.json';
const contractAbi = contractArtifact.abi;

// How many blocks to look back on first startup (no checkpoint)
const DEFAULT_LOOKBACK_BLOCKS = 1000;

// Checkpoint interval: save state every N events (or on shutdown)
const CHECKPOINT_INTERVAL = 10;

// Network name map for ethers provider
const CHAIN_NAMES: Record<number, string> = {
  1: 'mainnet',
  137: 'polygon',
  80002: 'amoy',
  11155111: 'sepolia',
};

// =====================================================
// Listener Class
// =====================================================

class BlockchainListenerService {
  private wsProvider: ethers.WebSocketProvider | null = null;
  private httpProvider: ethers.JsonRpcProvider | null = null;
  private contract: ethers.Contract | null = null;
  private isRunning = false;
  private eventsSinceCheckpoint = 0;
  private lastProcessedBlock = 0;
  private onPaymentCallback: ((event: CryptoPaymentEvent) => Promise<void>) | null = null;

  /**
   * Register a callback to handle PaymentProcessed events.
   * Typically wired up in src/index.ts startup.
   */
  onPaymentProcessed(callback: (event: CryptoPaymentEvent) => Promise<void>): void {
    this.onPaymentCallback = callback;
  }

  /**
   * Start the listener:
   *   1. Read last checkpoint from DB
   *   2. Replay missed blocks
   *   3. Subscribe to live events
   */
  async start(): Promise<void> {
    const config = loadCryptoConfig();
    if (!config) {
      logger.info('Blockchain listener not started: crypto rail not configured');
      return;
    }

    if (this.isRunning) {
      logger.warn('Blockchain listener already running');
      return;
    }

    logger.info(
      { contractAddress: config.contractAddress, chainId: config.chainId },
      'Starting blockchain listener',
    );

    // Initialize providers
    this.httpProvider = new ethers.JsonRpcProvider(config.rpcUrl, {
      chainId: config.chainId,
      name: CHAIN_NAMES[config.chainId] || `chain-${config.chainId}`,
    });

    try {
      this.wsProvider = new ethers.WebSocketProvider(config.wsUrl, {
        chainId: config.chainId,
        name: CHAIN_NAMES[config.chainId] || `chain-${config.chainId}`,
      });
    } catch (err) {
      logger.warn({ err }, 'WebSocket provider failed, will use HTTP polling');
    }

    // Use WS if available, else HTTP
    const activeProvider = this.wsProvider || this.httpProvider;
    this.contract = new ethers.Contract(config.contractAddress, contractAbi, activeProvider);

    // 1. Read last checkpoint
    this.lastProcessedBlock = await this.readCheckpoint(config.contractAddress, config.chainId);

    // 2. Replay missed blocks
    const currentBlock = await activeProvider.getBlockNumber();
    if (this.lastProcessedBlock > 0 && this.lastProcessedBlock < currentBlock) {
      logger.info(
        { from: this.lastProcessedBlock + 1, to: currentBlock },
        'Replaying missed blocks',
      );
      await this.replayBlocks(this.lastProcessedBlock + 1, currentBlock);
    } else if (this.lastProcessedBlock === 0) {
      // First startup — look back DEFAULT_LOOKBACK_BLOCKS
      const fromBlock = Math.max(0, currentBlock - DEFAULT_LOOKBACK_BLOCKS);
      logger.info({ from: fromBlock, to: currentBlock }, 'First startup: scanning recent blocks');
      await this.replayBlocks(fromBlock, currentBlock);
    }

    // 3. Subscribe to live events
    this.isRunning = true;
    this.subscribeLiveEvents();

    logger.info('Blockchain listener started successfully');
  }

  /**
   * Gracefully stop the listener and save checkpoint.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    logger.info('Stopping blockchain listener');

    // Remove event listeners
    if (this.contract) {
      this.contract.removeAllListeners();
    }

    // Save final checkpoint
    if (this.lastProcessedBlock > 0) {
      const config = loadCryptoConfig();
      if (config) {
        await this.saveCheckpoint(config.contractAddress, config.chainId, this.lastProcessedBlock);
      }
    }

    // Close WebSocket
    if (this.wsProvider) {
      await this.wsProvider.destroy();
      this.wsProvider = null;
    }

    logger.info('Blockchain listener stopped');
  }

  // =======================================================
  // Private Helpers
  // =======================================================

  /**
   * Subscribe to live PaymentProcessed and PaymentProcessedWithSwap events.
   */
  private subscribeLiveEvents(): void {
    if (!this.contract) return;

    // Subscribe to ERC20 PaymentProcessed events
    const paymentFilter = this.contract.filters.PaymentProcessed();
    this.contract.on(paymentFilter, async (...args: any[]) => {
      try {
        const eventLog = args[args.length - 1];
        const event = this.parseEventArgs(eventLog);
        if (event) {
          await this.handleEvent(event);
        }
      } catch (err) {
        logger.error({ err }, 'Error handling live PaymentProcessed event');
      }
    });

    // Subscribe to PaymentProcessedWithSwap events
    const swapFilter = this.contract.filters.PaymentProcessedWithSwap();
    this.contract.on(swapFilter, async (...args: any[]) => {
      try {
        const eventLog = args[args.length - 1];
        const event = this.parseSwapEventArgs(eventLog);
        if (event) {
          await this.handleEvent(event);
        }
      } catch (err) {
        logger.error({ err }, 'Error handling live PaymentProcessedWithSwap event');
      }
    });

    logger.info('Subscribed to live PaymentProcessed + PaymentProcessedWithSwap events');
  }

  /**
   * Replay missed blocks by querying historical events.
   */
  private async replayBlocks(fromBlock: number, toBlock: number): Promise<void> {
    if (!this.contract) return;

    const CHUNK_SIZE = 2000;
    for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE - 1, toBlock);

      // Replay ERC20 PaymentProcessed events
      const paymentFilter = this.contract.filters.PaymentProcessed();
      const paymentEvents = await this.contract.queryFilter(paymentFilter, start, end);
      for (const eventLog of paymentEvents) {
        const event = this.parseEventArgs(eventLog);
        if (event) {
          await this.handleEvent(event);
        }
      }

      // Replay PaymentProcessedWithSwap events
      const swapFilter = this.contract.filters.PaymentProcessedWithSwap();
      const swapEvents = await this.contract.queryFilter(swapFilter, start, end);
      for (const eventLog of swapEvents) {
        const event = this.parseSwapEventArgs(eventLog);
        if (event) {
          await this.handleEvent(event);
        }
      }

      this.lastProcessedBlock = end;
    }

    const config = loadCryptoConfig();
    if (config) {
      await this.saveCheckpoint(config.contractAddress, config.chainId, toBlock);
    }
  }

  /**
   * Parse event args from an ethers EventLog.
   * v2: includes token field from PaymentProcessed event.
   */
  private parseEventArgs(eventLog: any): CryptoPaymentEvent | null {
    try {
      return {
        paymentReference: eventLog.args.paymentReference,
        payer: eventLog.args.payer,
        recipientWallet: eventLog.args.recipientWallet,
        token: eventLog.args.token,
        principalAmount: eventLog.args.principalAmount,
        fee: eventLog.args.fee,
        paymentType: Number(eventLog.args.paymentType),
        txHash: eventLog.transactionHash,
        blockNumber: eventLog.blockNumber,
      };
    } catch (err) {
      logger.error({ err, eventLog }, 'Failed to parse PaymentProcessed event');
      return null;
    }
  }

  /**
   * Parse PaymentProcessedWithSwap event args.
   * Maps swap-specific fields while maintaining compatibility with CryptoPaymentEvent.
   */
  private parseSwapEventArgs(eventLog: any): CryptoPaymentEvent | null {
    try {
      return {
        paymentReference: eventLog.args.paymentReference,
        payer: eventLog.args.payer,
        recipientWallet: eventLog.args.recipientWallet,
        token: eventLog.args.tokenIn,          // token payer sent
        principalAmount: eventLog.args.amountIn, // amount payer sent
        fee: eventLog.args.feeIn,
        paymentType: Number(eventLog.args.paymentType),
        txHash: eventLog.transactionHash,
        blockNumber: eventLog.blockNumber,
        // Swap-specific fields
        isSwap: true,
        tokenIn: eventLog.args.tokenIn,
        tokenOut: eventLog.args.tokenOut,
        amountIn: eventLog.args.amountIn,
        amountOut: eventLog.args.amountOut,
      };
    } catch (err) {
      logger.error({ err, eventLog }, 'Failed to parse PaymentProcessedWithSwap event');
      return null;
    }
  }

  /**
   * Handle a single PaymentProcessed event.
   */
  private async handleEvent(event: CryptoPaymentEvent): Promise<void> {
    logger.info(
      { txHash: event.txHash, payer: event.payer, token: event.token, block: event.blockNumber },
      'Processing PaymentProcessed event',
    );

    // Update DB: mark matching pending transaction as completed.
    // Match by reference_hash (stored in metadata) for precision — avoids
    // mismatches when the same payer has multiple pending transactions.
    const swapMetadata = event.isSwap
      ? `, 'swap_token_in', '${event.tokenIn?.toLowerCase()}', 'swap_token_out', '${event.tokenOut?.toLowerCase()}', 'swap_amount_out', '${Number(event.amountOut)}'`
      : '';

    const result = await pool.query(
      `UPDATE payment_transactions
       SET status = 'completed',
           tx_hash = $1,
           block_number = $2,
           payer_wallet = $3,
           recipient_wallet = $4,
           principal_crypto = $5,
           fee_crypto = $6,
           crypto_token_address = $7,
           metadata = metadata || jsonb_build_object(
             'confirmed_at', NOW()::text,
             'is_swap', $8::boolean
             ${swapMetadata}
           ),
           updated_at = NOW()
       WHERE payment_channel = 'crypto'
         AND status = 'pending'
         AND metadata->>'reference_hash' = $9
       RETURNING reference`,
      [
        event.txHash,
        event.blockNumber,
        event.payer.toLowerCase(),
        event.recipientWallet.toLowerCase(),
        Number(event.principalAmount),
        Number(event.fee),
        event.token.toLowerCase(),
        event.isSwap || false,
        event.paymentReference, // keccak256 hash stored in metadata
      ],
    );

    if (result.rowCount && result.rowCount > 0) {
      logger.info(
        { reference: result.rows[0].reference, txHash: event.txHash, isSwap: event.isSwap || false },
        'Matched and completed pending crypto transaction',
      );
    } else {
      // Fallback: try matching by payer + recipient (for txns created before reference_hash was stored)
      const fallback = await pool.query(
        `UPDATE payment_transactions
         SET status = 'completed',
             tx_hash = $1,
             block_number = $2,
             payer_wallet = $3,
             recipient_wallet = $4,
             principal_crypto = $5,
             fee_crypto = $6,
             crypto_token_address = $7,
             updated_at = NOW()
         WHERE payment_channel = 'crypto'
           AND status = 'pending'
           AND payer_wallet = $3
           AND recipient_wallet = $4
           AND tx_hash IS NULL
         ORDER BY created_at ASC
         LIMIT 1
         RETURNING reference`,
        [
          event.txHash,
          event.blockNumber,
          event.payer.toLowerCase(),
          event.recipientWallet.toLowerCase(),
          Number(event.principalAmount),
          Number(event.fee),
          event.token.toLowerCase(),
        ],
      );

      if (fallback.rowCount && fallback.rowCount > 0) {
        logger.info(
          { reference: fallback.rows[0].reference, txHash: event.txHash },
          'Matched pending crypto transaction via fallback (payer+recipient)',
        );
      } else {
        logger.warn(
          { txHash: event.txHash, payer: event.payer, isSwap: event.isSwap || false },
          'Payment event did not match any pending transaction',
        );
      }
    }

    // If there's a callback registered, invoke it
    if (this.onPaymentCallback) {
      await this.onPaymentCallback(event);
    }

    // Track for checkpointing
    this.lastProcessedBlock = Math.max(this.lastProcessedBlock, event.blockNumber);
    this.eventsSinceCheckpoint++;

    if (this.eventsSinceCheckpoint >= CHECKPOINT_INTERVAL) {
      const config = loadCryptoConfig();
      if (config) {
        await this.saveCheckpoint(config.contractAddress, config.chainId, this.lastProcessedBlock);
        this.eventsSinceCheckpoint = 0;
      }
    }
  }

  /**
   * Parse ExternalPaymentRecorded event args from an ethers EventLog.
  /**
   * Read last processed block from DB.
   */
  private async readCheckpoint(contractAddress: string, chainId: number): Promise<number> {
    try {
      const result = await pool.query(
        `SELECT last_processed_block FROM blockchain_sync_state
         WHERE chain_id = $1 AND contract_address = $2`,
        [chainId, contractAddress.toLowerCase()],
      );
      if (result.rows.length > 0) {
        return result.rows[0].last_processed_block;
      }
    } catch (err) {
      logger.error({ err }, 'Failed to read blockchain sync checkpoint');
    }
    return 0;
  }

  /**
   * Save checkpoint to DB (upsert).
   */
  private async saveCheckpoint(
    contractAddress: string,
    chainId: number,
    blockNumber: number,
  ): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO blockchain_sync_state (chain_id, contract_address, last_processed_block, last_processed_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (chain_id, contract_address)
         DO UPDATE SET last_processed_block = $3, last_processed_at = NOW()`,
        [chainId, contractAddress.toLowerCase(), blockNumber],
      );
    } catch (err) {
      logger.error({ err, blockNumber }, 'Failed to save blockchain sync checkpoint');
    }
  }
}

// Singleton export
export const blockchainListenerService = new BlockchainListenerService();
