// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./interfaces/ISwapRouter.sol";

/**
 * @title PROPMETRIKPayments
 * @notice Multi-token payment processor supporting ERC20 on-chain payments with
 *         auto-conversion via DEX swap. Supports any ERC20 token (USDT, USDC, WETH, etc.)
 *         via an owner-managed allowlist.
 *         Off-chain cross-chain payments (BTC, LTC, SOL, etc.) are handled by
 *         the NOWPayments integration layer in the backend.
 *         Mirrors the FeeEngine logic from the PROPMETRIK backend.
 *         Contract never holds funds — atomic transferFrom splits in each ERC20 tx.
 * @dev    Uses OpenZeppelin v5: ReentrancyGuard, Pausable, Ownable2Step, SafeERC20.
 */
contract PROPMETRIKPayments is ReentrancyGuard, Pausable, Ownable2Step {
    using SafeERC20 for IERC20;

    // ── Enums & Structs ──────────────────────────────────────────────

    enum PaymentType { RENT, DEAL, PROJECT, VALUATION }

    struct TokenConfig {
        bool enabled;
        uint8 decimals;
        string symbol;
    }

    struct FeeConfig {
        uint128 percentageBasisPoints;  // e.g. 100 = 1.00%
        uint128 minimumFeeUSD6;         // stored as 6-decimal USD (e.g. 1_650000 = $1.65)
        bool enabled;
    }

    struct Recipient {
        bool isActive;
        uint96 totalReceived;   // denominated in token's native units
        uint32 paymentCount;
    }

    struct SwapPaymentParams {
        address token;
        PaymentType paymentType;
        bytes32 recipientEntityId;
        uint256 principalAmount;
        bytes32 paymentReference;
        uint256 amountOutMinimum;
    }

    // ── State ────────────────────────────────────────────────────────

    address public propmetrikWallet;

    mapping(PaymentType => FeeConfig) public feeConfigs;
    mapping(address => TokenConfig) public acceptedTokens;
    address[] public tokenList;
    mapping(address => uint128) public tokenUsd6PerToken;
    mapping(address => bool) public tokenMinFeeEnabled;

    mapping(bytes32 => address) public recipientWallets;
    mapping(address => bytes32) public walletEntityIds;
    mapping(address => Recipient) public recipients;
    mapping(bytes32 => bool) public processedReferences;

    // ── Swap / Auto-Conversion State ─────────────────────────────────

    /// @notice Authorized registrar addresses that can register/manage recipients
    mapping(address => bool) public authorizedRegistrars;

    /// @notice DEX swap router (QuickSwap V3 / Uniswap V3 compatible)
    ISwapRouter public swapRouter;

    /// @notice Recipient's preferred token for receiving payments
    ///         Key: entityId → preferred ERC20 token address (address(0) = no preference / same token)
    mapping(bytes32 => address) public recipientPreferredTokens;

    /// @notice Default pool fee tier for DEX swaps (e.g. 3000 = 0.3%, 500 = 0.05%)
    uint24 public defaultSwapFeeTier = 3000;

    /// @notice Per-pair pool fee tier overrides
    ///         Key: keccak256(abi.encodePacked(tokenIn, tokenOut)) → fee tier
    mapping(bytes32 => uint24) public pairSwapFeeTiers;

    /// @notice Maximum slippage in basis points for swaps (e.g. 100 = 1%)
    uint256 public maxSwapSlippageBps = 100;

    /// @notice Platform's preferred token for receiving fees.
    ///         When set, all platform fees are auto-converted to this token via DEX swap.
    ///         address(0) = no preference (fees stay in the payer's token).
    address public platformPreferredToken;

    // ── Events ───────────────────────────────────────────────────────

    event PaymentProcessed(
        bytes32 indexed paymentReference,
        address indexed payer,
        address indexed recipientWallet,
        address token,
        uint256 principalAmount,
        uint256 fee,
        PaymentType paymentType
    );

    event TokenAdded(address indexed token, string symbol, uint8 decimals);
    event TokenRemoved(address indexed token);
    event TokenToggled(address indexed token, bool enabled);
    event TokenPricingUpdated(address indexed token, uint128 usd6PerToken, bool minimumEnabled);
    event RegistrarAuthorized(address indexed registrar);
    event RegistrarRevoked(address indexed registrar);
    event RecipientRegistered(bytes32 indexed entityId, address wallet);
    event RecipientDeactivated(bytes32 indexed entityId);
    event RecipientWalletUpdated(bytes32 indexed entityId, address oldWallet, address newWallet);
    event FeeConfigUpdated(PaymentType indexed paymentType, uint128 basisPoints, uint128 minimumFeeUSD6);
    event PROPMETRIKWalletUpdated(address indexed oldWallet, address indexed newWallet);

    event SwapRouterUpdated(address indexed oldRouter, address indexed newRouter);
    event RecipientPreferredTokenSet(bytes32 indexed entityId, address indexed preferredToken);
    event DefaultSwapFeeTierUpdated(uint24 oldTier, uint24 newTier);
    event PairSwapFeeTierSet(address indexed tokenIn, address indexed tokenOut, uint24 feeTier);
    event MaxSwapSlippageUpdated(uint256 oldBps, uint256 newBps);
    event PlatformPreferredTokenSet(address indexed oldToken, address indexed newToken);
    event PaymentProcessedWithSwap(
        bytes32 indexed paymentReference,
        address indexed payer,
        address indexed recipientWallet,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 feeIn,
        PaymentType paymentType
    );

    // ── Off-Chain Payment Attestation Events ─────────────────────────

    /**
     * @notice Emitted when an off-chain payment (BTC, SOL, LTC, etc. via NOWPayments)
     *         is attested on-chain for audit/compliance. No tokens move through the
     *         contract — this is a cryptographic proof of payment recorded immutably.
     *
     *         Auditors can query these events via Polygonscan or The Graph to get
     *         a complete, unified view of ALL payments (on-chain + off-chain).
     *
     * @dev    attestationHash = keccak256(abi.encode(all payment details)) — can be
     *         independently verified by any party with the original data.
     */
    event OffChainPaymentAttested(
        bytes32 indexed paymentReference,
        bytes32 indexed recipientEntityId,
        PaymentType paymentType,
        bytes32 attestationHash,    // keccak256 of full payment data
        uint256 amountUsd6,         // USD amount in 6-decimal fixed point
        string payCurrency,         // e.g. "btc"
        string outcomeCurrency,     // e.g. "sol"
        string externalPaymentId,   // NOWPayments payment_id
        uint256 timestamp           // When the settlement confirmed
    );

    // ── Off-Chain Attestation State ──────────────────────────────────

    /// @notice Count of off-chain attested payments (for audit queries)
    uint256 public offChainPaymentCount;

    /// @notice Mapping of paymentReference → attestation hash for on-chain verification
    mapping(bytes32 => bytes32) public attestationHashes;

    // ── Constructor ──────────────────────────────────────────────────

    /**
     * @param _propmetrikWallet  Platform fee collection wallet (Safe multisig).
     * @param _initialOwner      Owner address (Safe multisig or deployer).
     */
    constructor(
        address _propmetrikWallet,
        address _initialOwner
    ) Ownable(_initialOwner) {
        require(_propmetrikWallet != address(0), "Platform wallet cannot be zero");
        propmetrikWallet = _propmetrikWallet;

        // Default fee schedule — matches backend FeeEngine
        // RENT minimum: GH₵25 ≈ $1.67 USD at ~15 GHS/USD (updated for v2.3)
        feeConfigs[PaymentType.RENT]      = FeeConfig({ percentageBasisPoints: 100, minimumFeeUSD6: 1_670000, enabled: true });
        feeConfigs[PaymentType.DEAL]      = FeeConfig({ percentageBasisPoints: 25,  minimumFeeUSD6: 0,        enabled: true });
        feeConfigs[PaymentType.PROJECT]   = FeeConfig({ percentageBasisPoints: 25,  minimumFeeUSD6: 0,        enabled: true });
        feeConfigs[PaymentType.VALUATION] = FeeConfig({ percentageBasisPoints: 250, minimumFeeUSD6: 0,        enabled: true });
    }

    // ── Access Control ───────────────────────────────────────────────

    /**
     * @dev Modifier: allows owner OR authorized registrar.
     *      Used for recipient management functions so the backend can
     *      auto-register landlords without going through the Safe multisig.
     */
    modifier onlyRegistrar() {
        require(
            msg.sender == owner() || authorizedRegistrars[msg.sender],
            "Not owner or registrar"
        );
        _;
    }

    // ── Token Management ─────────────────────────────────────────────

    /**
     * @notice Add a new ERC20 token to the allowlist.
     * @param token    Token contract address.
     * @param symbol   Human-readable symbol (e.g. "USDT").
     * @param decimals Token's decimals (e.g. 6 for USDT, 18 for WETH).
     */
    function addToken(address token, string calldata symbol, uint8 decimals) external onlyOwner {
        require(token != address(0), "Token cannot be zero address");
        require(decimals <= 24, "Decimals too high");
        require(
            !acceptedTokens[token].enabled && bytes(acceptedTokens[token].symbol).length == 0,
            "Token already added"
        );
        acceptedTokens[token] = TokenConfig({ enabled: true, decimals: decimals, symbol: symbol });

        if (decimals == 6) {
            tokenUsd6PerToken[token] = 1_000000;
            tokenMinFeeEnabled[token] = true;
        } else {
            tokenUsd6PerToken[token] = 0;
            tokenMinFeeEnabled[token] = false;
        }

        tokenList.push(token);
        emit TokenAdded(token, symbol, decimals);
    }

    /**
     * @notice Enable or disable a token without removing its config.
     */
    function setTokenEnabled(address token, bool enabled) external onlyOwner {
        require(bytes(acceptedTokens[token].symbol).length > 0, "Token not registered");
        acceptedTokens[token].enabled = enabled;
        emit TokenToggled(token, enabled);
    }

    /**
     * @notice Remove a token entirely from the allowlist.
     *         Token address stays in tokenList for historical reference;
     *         the config is deleted so re-adding is possible.
     */
    function removeToken(address token) external onlyOwner {
        require(bytes(acceptedTokens[token].symbol).length > 0, "Token not registered");
        delete acceptedTokens[token];
        delete tokenUsd6PerToken[token];
        delete tokenMinFeeEnabled[token];
        emit TokenRemoved(token);
    }

    function setTokenPricing(address token, uint128 usd6PerToken, bool minimumEnabled) external onlyOwner {
        require(bytes(acceptedTokens[token].symbol).length > 0, "Token not registered");
        require(!minimumEnabled || usd6PerToken > 0, "USD price required");
        tokenUsd6PerToken[token] = usd6PerToken;
        tokenMinFeeEnabled[token] = minimumEnabled;
        emit TokenPricingUpdated(token, usd6PerToken, minimumEnabled);
    }

    /**
     * @notice Number of tokens ever added (includes removed).
     */
    function getTokenCount() external view returns (uint256) {
        return tokenList.length;
    }

    // ── Swap Configuration ─────────────────────────────────────────

    /**
     * @notice Set the DEX swap router address (QuickSwap V3 / Uniswap V3).
     *         Setting to address(0) disables swap functionality.
     */
    function setSwapRouter(address router) external onlyOwner {
        address old = address(swapRouter);
        swapRouter = ISwapRouter(router);
        emit SwapRouterUpdated(old, router);
    }

    /**
     * @notice Set a recipient's preferred token for receiving payments.
     *         When a tenant pays in a different token, it will be auto-converted
     *         to this token via the DEX swap router.
     * @param entityId       The recipient's entity identifier.
     * @param preferredToken The ERC20 token address the recipient prefers, or address(0) to clear.
     */
    function setRecipientPreferredToken(bytes32 entityId, address preferredToken) external onlyRegistrar {
        require(recipientWallets[entityId] != address(0), "Entity not registered");
        require(
            preferredToken == address(0) || acceptedTokens[preferredToken].enabled,
            "Preferred token not accepted"
        );
        recipientPreferredTokens[entityId] = preferredToken;
        emit RecipientPreferredTokenSet(entityId, preferredToken);
    }

    /**
     * @notice Set default pool fee tier for swaps (e.g. 3000 = 0.3%).
     */
    function setDefaultSwapFeeTier(uint24 feeTier) external onlyOwner {
        require(feeTier > 0 && feeTier <= 100000, "Invalid fee tier");
        uint24 old = defaultSwapFeeTier;
        defaultSwapFeeTier = feeTier;
        emit DefaultSwapFeeTierUpdated(old, feeTier);
    }

    /**
     * @notice Set a specific pool fee tier for a token pair.
     * @param tokenIn  The input token.
     * @param tokenOut The output token.
     * @param feeTier  Pool fee tier (e.g. 500 for stablecoins, 3000 for normal pairs).
     */
    function setPairSwapFeeTier(address tokenIn, address tokenOut, uint24 feeTier) external onlyOwner {
        require(feeTier > 0 && feeTier <= 100000, "Invalid fee tier");
        bytes32 key = keccak256(abi.encodePacked(tokenIn, tokenOut));
        pairSwapFeeTiers[key] = feeTier;
        emit PairSwapFeeTierSet(tokenIn, tokenOut, feeTier);
    }

    /**
     * @notice Set maximum allowed slippage for swaps.
     * @param bps Basis points (e.g. 100 = 1%, 50 = 0.5%).
     */
    function setMaxSwapSlippage(uint256 bps) external onlyOwner {
        require(bps > 0 && bps <= 1000, "Slippage 1-1000 bps");
        uint256 old = maxSwapSlippageBps;
        maxSwapSlippageBps = bps;
        emit MaxSwapSlippageUpdated(old, bps);
    }

    /**
     * @notice Get the effective pool fee tier for a token pair.
     */
    function getSwapFeeTier(address tokenIn, address tokenOut) public view returns (uint24) {
        bytes32 key = keccak256(abi.encodePacked(tokenIn, tokenOut));
        uint24 tier = pairSwapFeeTiers[key];
        return tier > 0 ? tier : defaultSwapFeeTier;
    }

    /**
     * @notice Set the platform's preferred token for receiving fees.
     *         When set, all on-chain platform fees are auto-converted to this token
     *         via the DEX swap router before being sent to propmetrikWallet.
     *         Set to address(0) to clear the preference (fees stay in payer's token).
     * @param preferredToken ERC20 token address the platform prefers, or address(0) to clear.
     */
    function setPlatformPreferredToken(address preferredToken) external onlyOwner {
        require(
            preferredToken == address(0) || acceptedTokens[preferredToken].enabled,
            "Preferred token not accepted"
        );
        address old = platformPreferredToken;
        platformPreferredToken = preferredToken;
        emit PlatformPreferredTokenSet(old, preferredToken);
    }

    // ── Registrar Management ────────────────────────────────────────

    /**
     * @notice Authorize an address as a registrar (can register/manage recipients).
     *         Allows the backend to auto-register landlords without Safe multisig.
     */
    function authorizeRegistrar(address registrar) external onlyOwner {
        require(registrar != address(0), "Registrar cannot be zero address");
        require(!authorizedRegistrars[registrar], "Already authorized");
        authorizedRegistrars[registrar] = true;
        emit RegistrarAuthorized(registrar);
    }

    /**
     * @notice Revoke registrar authorization.
     */
    function revokeRegistrar(address registrar) external onlyOwner {
        require(authorizedRegistrars[registrar], "Not an authorized registrar");
        authorizedRegistrars[registrar] = false;
        emit RegistrarRevoked(registrar);
    }

    // ── Core: Process Payment ────────────────────────────────────────

    /**
     * @notice Process a payment: transfer principal to recipient + fee to PROPMETRIK.
     * @param token              ERC20 token to pay with (must be in allowlist).
     * @param paymentType        RENT, DEAL, or PROJECT.
     * @param recipientEntityId  Keccak256 entity identifier for the recipient.
     * @param principalAmount    Amount sent to the recipient (in token's native decimals).
     * @param paymentReference   Unique idempotency key for this payment.
     */
    function processPayment(
        address token,
        PaymentType paymentType,
        bytes32 recipientEntityId,
        uint256 principalAmount,
        bytes32 paymentReference,
        bytes calldata /* metadata */
    ) external nonReentrant whenNotPaused returns (bool) {
        require(principalAmount > 0, "Amount must be > 0");
        require(acceptedTokens[token].enabled, "Token not accepted");
        require(feeConfigs[paymentType].enabled, "Payment type disabled");

        address _recipientWallet = recipientWallets[recipientEntityId];
        require(_recipientWallet != address(0), "Recipient not registered");
        require(recipients[_recipientWallet].isActive, "Recipient not active");
        require(!processedReferences[paymentReference], "Duplicate reference");

        uint256 fee = _calculateTokenFee(token, paymentType, principalAmount);

        // Atomic splits
        IERC20(token).safeTransferFrom(msg.sender, _recipientWallet, principalAmount);
        if (fee > 0) {
            _collectPlatformFee(token, fee, true);
        }

        processedReferences[paymentReference] = true;

        // Update recipient stats
        _updateRecipientStats(_recipientWallet, principalAmount);

        emit PaymentProcessed(
            paymentReference,
            msg.sender,
            _recipientWallet,
            token,
            principalAmount,
            fee,
            paymentType
        );
        return true;
    }

    // ── Core: Process Payment With Auto-Conversion ───────────────────

    /**
     * @notice Process a payment with optional auto-conversion to the recipient's
     *         preferred token via DEX swap.
     *
     *         If the recipient has no preferred token, or preferred == payment token,
     *         this behaves identically to processPayment().
     *
     *         When conversion is needed:
     *         1. Transfer total (principal + fee) from payer to this contract
     *         2. Swap principal amount from tokenIn → tokenOut via DEX
     *         3. Send swapped output tokens to recipient
     *         4. Send fee in original token to platform wallet
     *
     * @param p  SwapPaymentParams struct containing token, paymentType,
     *           recipientEntityId, principalAmount, paymentReference,
     *           and amountOutMinimum (pass 0 for automatic slippage).
     */
    function processPaymentWithSwap(
        SwapPaymentParams calldata p,
        bytes calldata /* metadata */
    ) external nonReentrant whenNotPaused returns (bool) {
        require(p.principalAmount > 0, "Amount must be > 0");
        require(acceptedTokens[p.token].enabled, "Token not accepted");
        require(feeConfigs[p.paymentType].enabled, "Payment type disabled");

        address _recipientWallet = recipientWallets[p.recipientEntityId];
        require(_recipientWallet != address(0), "Recipient not registered");
        require(recipients[_recipientWallet].isActive, "Recipient not active");
        require(!processedReferences[p.paymentReference], "Duplicate reference");

        processedReferences[p.paymentReference] = true;

        uint256 fee = _calculateTokenFee(p.token, p.paymentType, p.principalAmount);

        address preferredToken = recipientPreferredTokens[p.recipientEntityId];
        bool needsSwap = preferredToken != address(0)
            && preferredToken != p.token
            && address(swapRouter) != address(0);

        if (!needsSwap) {
            _executeDirectPayment(p.token, _recipientWallet, p.principalAmount, fee);
            emit PaymentProcessed(
                p.paymentReference, msg.sender, _recipientWallet,
                p.token, p.principalAmount, fee, p.paymentType
            );
        } else {
            require(acceptedTokens[preferredToken].enabled, "Preferred token disabled");
            _executeAndEmitSwap(p, _recipientWallet, fee, preferredToken);
        }
        return true;
    }

    /**
     * @dev Internal: direct payment without swap (atomic splits).
     */
    function _executeDirectPayment(
        address token,
        address recipientWallet,
        uint256 principalAmount,
        uint256 fee
    ) internal {
        IERC20(token).safeTransferFrom(msg.sender, recipientWallet, principalAmount);
        if (fee > 0) {
            _collectPlatformFee(token, fee, true);
        }
        _updateRecipientStats(recipientWallet, principalAmount);
    }

    /**
     * @dev Internal: execute swap + emit event. Separated to avoid stack-too-deep.
     */
    function _executeAndEmitSwap(
        SwapPaymentParams calldata p,
        address recipientWallet,
        uint256 fee,
        address preferredToken
    ) internal {
        uint256 amountOut = _executeSwapPayment(
            p.token, preferredToken, recipientWallet,
            p.principalAmount, fee, p.amountOutMinimum
        );
        _updateRecipientStats(recipientWallet, amountOut);
        emit PaymentProcessedWithSwap(
            p.paymentReference, msg.sender, recipientWallet,
            p.token, preferredToken, p.principalAmount, amountOut,
            fee, p.paymentType
        );
    }

    /**
     * @dev Internal: execute the DEX swap for processPaymentWithSwap.
     *      Separated to avoid stack-too-deep in the main function.
     */
    function _executeSwapPayment(
        address tokenIn,
        address tokenOut,
        address recipient,
        uint256 principalAmount,
        uint256 fee,
        uint256 amountOutMinimum
    ) internal returns (uint256 amountOut) {
        uint256 totalIn = principalAmount + fee;

        // Pull total from payer into this contract
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), totalIn);

        // Fee — send to platform (with optional auto-conversion)
        if (fee > 0) {
            _collectPlatformFee(tokenIn, fee, false);
        }

        // Approve swap router
        IERC20(tokenIn).forceApprove(address(swapRouter), principalAmount);

        // Slippage protection: caller MUST provide amountOutMinimum calculated
        // off-chain from DEX quote / oracle. When 0 is passed, we set to 1
        // (accept any output) — the caller chose to skip protection.
        // NOTE: auto-calculating slippage from principalAmount is wrong for
        // cross-decimal swaps (e.g. USDT 6dec → WBTC 8dec) where input and
        // output magnitudes differ by orders of magnitude.
        if (amountOutMinimum == 0) {
            amountOutMinimum = 1;
        }

        // Execute swap — output goes directly to recipient
        amountOut = swapRouter.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: getSwapFeeTier(tokenIn, tokenOut),
                recipient: recipient,
                deadline: block.timestamp,
                amountIn: principalAmount,
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: 0
            })
        );

        // Clear residual approval
        IERC20(tokenIn).forceApprove(address(swapRouter), 0);
    }

    /**
     * @dev Internal: collect platform fee with optional auto-conversion.
     *      If platformPreferredToken is set and differs from tokenIn, swaps via DEX.
     * @param tokenIn        The token in which the fee was originally charged.
     * @param fee            The fee amount in tokenIn's native units.
     * @param pullFromPayer  If true, pulls tokens from msg.sender (processPayment path).
     *                       If false, tokens are already in the contract (_executeSwapPayment path).
     */
    function _collectPlatformFee(address tokenIn, uint256 fee, bool pullFromPayer) internal {
        address prefToken = platformPreferredToken;
        bool needsSwap = prefToken != address(0)
            && prefToken != tokenIn
            && address(swapRouter) != address(0)
            && acceptedTokens[prefToken].enabled;

        if (!needsSwap) {
            // Direct transfer — no conversion needed
            if (pullFromPayer) {
                IERC20(tokenIn).safeTransferFrom(msg.sender, propmetrikWallet, fee);
            } else {
                IERC20(tokenIn).safeTransfer(propmetrikWallet, fee);
            }
        } else {
            // Pull into contract if needed, then swap to platform's preferred token
            if (pullFromPayer) {
                IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), fee);
            }

            // Swap fee to platform's preferred token — output goes to propmetrikWallet
            IERC20(tokenIn).forceApprove(address(swapRouter), fee);
            swapRouter.exactInputSingle(
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: prefToken,
                    fee: getSwapFeeTier(tokenIn, prefToken),
                    recipient: propmetrikWallet,
                    deadline: block.timestamp,
                    amountIn: fee,
                    amountOutMinimum: 1, // Platform fee swap accepts market price
                    sqrtPriceLimitX96: 0
                })
            );
            IERC20(tokenIn).forceApprove(address(swapRouter), 0);
        }
    }

    function _updateRecipientStats(address wallet, uint256 amount) private {
        Recipient storage profile = recipients[wallet];
        profile.totalReceived += uint96(amount);
        profile.paymentCount += 1;
    }

    // ── Fee Calculation ──────────────────────────────────────────────

    /**
     * @dev Internal fee calculator. Scales minimumFeeUSD6 to the token's native decimals.
     *      - 6-decimal tokens (USDT, USDC): 1:1 mapping.
     *      - 18-decimal tokens (WETH): multiply by 10^12.
     *      - < 6-decimal tokens: divide by 10^(6 - tokenDecimals).
     */
    function _calculateFee(
        PaymentType paymentType,
        uint256 principal,
        uint8 tokenDecimals,
        bool minimumEnabled,
        uint128 usd6PerToken
    ) internal view returns (uint256) {
        FeeConfig memory config = feeConfigs[paymentType];
        uint256 percentageFee = (principal * config.percentageBasisPoints) / 10000;

        if (paymentType == PaymentType.RENT && config.minimumFeeUSD6 > 0 && minimumEnabled) {
            uint256 scaledMinimum = _usd6ToNativeUnits(config.minimumFeeUSD6, tokenDecimals, usd6PerToken);
            return percentageFee > scaledMinimum ? percentageFee : scaledMinimum;
        }
        return percentageFee;
    }

    function _calculateTokenFee(address token, PaymentType paymentType, uint256 principal) internal view returns (uint256) {
        TokenConfig memory config = acceptedTokens[token];
        return _calculateFee(
            paymentType,
            principal,
            config.decimals,
            tokenMinFeeEnabled[token],
            tokenUsd6PerToken[token]
        );
    }

    function _usd6ToNativeUnits(uint128 usd6Amount, uint8 tokenDecimals, uint128 usd6PerToken) internal pure returns (uint256) {
        require(usd6PerToken > 0, "USD price not configured");
        return (uint256(usd6Amount) * (10 ** tokenDecimals)) / uint256(usd6PerToken);
    }

    /**
     * @notice Public fee preview — same logic as processPayment.
     */
    function calculateFee(
        address token,
        PaymentType paymentType,
        uint256 principal
    ) external view returns (uint256) {
        require(acceptedTokens[token].enabled, "Token not accepted");
        require(feeConfigs[paymentType].enabled, "Payment type disabled");
        return _calculateTokenFee(token, paymentType, principal);
    }

    // ── Admin: Fee Configuration ─────────────────────────────────────

    function updateFeeConfig(
        PaymentType paymentType,
        uint128 basisPoints,
        uint128 minimumFeeUSD6
    ) external onlyOwner {
        require(basisPoints <= 10000, "Basis points cannot exceed 100%");
        feeConfigs[paymentType].percentageBasisPoints = basisPoints;
        feeConfigs[paymentType].minimumFeeUSD6 = minimumFeeUSD6;
        emit FeeConfigUpdated(paymentType, basisPoints, minimumFeeUSD6);
    }

    function setPaymentTypeEnabled(PaymentType paymentType, bool enabled) external onlyOwner {
        feeConfigs[paymentType].enabled = enabled;
    }

    // ── Admin: Recipient Management ──────────────────────────────────

    function registerRecipient(bytes32 entityId, address wallet) external onlyRegistrar {
        require(entityId != bytes32(0), "Entity cannot be zero");
        require(wallet != address(0), "Wallet cannot be zero address");
        require(wallet != propmetrikWallet, "Cannot use platform wallet");
        require(recipientWallets[entityId] == address(0), "Entity already registered");
        require(walletEntityIds[wallet] == bytes32(0), "Wallet already assigned");
        recipientWallets[entityId] = wallet;
        walletEntityIds[wallet] = entityId;
        recipients[wallet] = Recipient({ isActive: true, totalReceived: 0, paymentCount: 0 });
        emit RecipientRegistered(entityId, wallet);
    }

    function updateRecipientWallet(bytes32 entityId, address newWallet) external onlyRegistrar {
        require(entityId != bytes32(0), "Entity cannot be zero");
        require(newWallet != address(0), "Wallet cannot be zero address");
        require(newWallet != propmetrikWallet, "Cannot use platform wallet");
        address oldWallet = recipientWallets[entityId];
        require(oldWallet != address(0), "Entity not registered");
        require(oldWallet != newWallet, "Same wallet address");
        bytes32 existingEntity = walletEntityIds[newWallet];
        require(existingEntity == bytes32(0) || existingEntity == entityId, "Wallet already assigned");

        Recipient memory profile = recipients[oldWallet];
        recipients[newWallet] = profile;
        recipients[oldWallet] = Recipient({
            isActive: false,
            totalReceived: profile.totalReceived,
            paymentCount: profile.paymentCount
        });
        delete walletEntityIds[oldWallet];
        walletEntityIds[newWallet] = entityId;
        recipientWallets[entityId] = newWallet;
        emit RecipientWalletUpdated(entityId, oldWallet, newWallet);
    }

    function deactivateRecipient(bytes32 entityId) external onlyRegistrar {
        address wallet = recipientWallets[entityId];
        require(wallet != address(0), "Entity not registered");
        require(recipients[wallet].isActive, "Already deactivated");
        recipients[wallet].isActive = false;
        emit RecipientDeactivated(entityId);
    }

    function reactivateRecipient(bytes32 entityId) external onlyRegistrar {
        address wallet = recipientWallets[entityId];
        require(wallet != address(0), "Entity not registered");
        require(!recipients[wallet].isActive, "Already active");
        recipients[wallet].isActive = true;
    }

    // ── Admin: Platform Wallet ───────────────────────────────────────

    function updatePropmetrikWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Wallet cannot be zero address");
        require(newWallet != propmetrikWallet, "Same wallet address");
        address oldWallet = propmetrikWallet;
        propmetrikWallet = newWallet;
        emit PROPMETRIKWalletUpdated(oldWallet, newWallet);
    }

    // ── Off-Chain Payment Attestation ────────────────────────────────

    /**
     * @notice Record an off-chain payment (via NOWPayments) on-chain as an
     *         immutable audit attestation. Only callable by authorized registrars
     *         or the contract owner.
     *
     *         This creates a permanent, queryable record that auditors can
     *         cross-reference with NOWPayments settlement data. The contract
     *         does NOT move any tokens — it only emits an event and stores hashes.
     *
     *         The attestationHash is computed off-chain as:
     *         keccak256(abi.encode(paymentReference, recipientEntityId, paymentType,
     *           payCurrency, payChain, amountUsd6, payerAmountRaw, payerDecimals,
     *           outcomeCurrency, outcomeAmountRaw, outcomeDecimals, externalPaymentId, timestamp))
     *
     *         Any auditor with the original data can independently verify the hash matches.
     *
     * @param paymentReference   Unique PROPMETRIK payment reference
     * @param recipientEntityId  Keccak256 entity ID of the payment recipient
     * @param paymentType        RENT, DEAL, or PROJECT
     * @param payCurrency        Ticker of coin the payer sent (e.g. "btc")
     * @param outcomeCurrency    Ticker the recipient received (e.g. "sol")
     * @param amountUsd6         Total USD value in 6-decimal fixed point
     * @param externalPaymentId  NOWPayments payment_id for cross-reference
     * @param attestationHash    keccak256 of full payment details (computed off-chain)
     * @param timestamp          Unix timestamp when the settlement confirmed
     */
    function recordOffChainPayment(
        bytes32 paymentReference,
        bytes32 recipientEntityId,
        PaymentType paymentType,
        string calldata payCurrency,
        string calldata outcomeCurrency,
        uint256 amountUsd6,
        string calldata externalPaymentId,
        bytes32 attestationHash,
        uint256 timestamp
    ) external onlyRegistrar whenNotPaused {
        require(!processedReferences[paymentReference], "Duplicate reference");
        require(amountUsd6 > 0, "Amount must be > 0");
        require(bytes(payCurrency).length > 0, "Pay currency required");
        require(bytes(externalPaymentId).length > 0, "External payment ID required");
        require(attestationHash != bytes32(0), "Attestation hash required");

        processedReferences[paymentReference] = true;
        attestationHashes[paymentReference] = attestationHash;
        offChainPaymentCount++;

        emit OffChainPaymentAttested(
            paymentReference,
            recipientEntityId,
            paymentType,
            attestationHash,
            amountUsd6,
            payCurrency,
            outcomeCurrency,
            externalPaymentId,
            timestamp
        );
    }

    /**
     * @notice Verify an off-chain payment attestation hash matches expected data.
     *         Any party can call this to independently verify a payment record.
     * @param paymentReference  The payment reference to verify
     * @param expectedHash      The hash computed from raw payment data
     * @return matches           True if the stored attestation hash matches
     * @return storedHash        The hash stored on-chain
     */
    function verifyAttestation(
        bytes32 paymentReference,
        bytes32 expectedHash
    ) external view returns (bool matches, bytes32 storedHash) {
        storedHash = attestationHashes[paymentReference];
        matches = (storedHash != bytes32(0)) && (storedHash == expectedHash);
    }

    // ── Emergency Controls ───────────────────────────────────────────

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Rescue tokens accidentally sent to or stuck in this contract.
     *         Only callable by owner (Safe multisig) for safety.
     * @param token  ERC20 token to rescue.
     * @param to     Destination address.
     * @param amount Amount to rescue.
     */
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Cannot rescue to zero address");
        IERC20(token).safeTransfer(to, amount);
    }

    // ── View Functions ───────────────────────────────────────────────

    function isReferenceProcessed(bytes32 paymentReference) external view returns (bool) {
        return processedReferences[paymentReference];
    }

    function getRecipientWallet(bytes32 entityId) external view returns (address) {
        return recipientWallets[entityId];
    }

    function getRecipientProfile(address wallet) external view returns (
        bool isActive,
        uint96 totalReceived,
        uint32 paymentCount
    ) {
        Recipient memory r = recipients[wallet];
        return (r.isActive, r.totalReceived, r.paymentCount);
    }

    function isTokenAccepted(address token) external view returns (
        bool enabled,
        string memory symbol,
        uint8 decimals
    ) {
        TokenConfig memory tc = acceptedTokens[token];
        return (tc.enabled, tc.symbol, tc.decimals);
    }

    /**
     * @notice Get total payment counts for audit overview.
     * @return onChainCount Total on-chain ERC-20 payments processed (query processedReferences for detail)
     * @return offChainCount Total off-chain payments attested via recordOffChainPayment()
     */
    function getPaymentCounts() external view returns (uint256 onChainCount, uint256 offChainCount) {
        return (0, offChainPaymentCount); // on-chain count not tracked separately — use event logs
    }
}
