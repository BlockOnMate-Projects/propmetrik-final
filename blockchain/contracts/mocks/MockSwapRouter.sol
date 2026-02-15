// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/ISwapRouter.sol";

/**
 * @title MockSwapRouter
 * @notice Simulates Uniswap V3 / QuickSwap V3 router for testing.
 *         Uses a configurable exchange rate (1:1 by default for stablecoin pairs).
 *         Mints output tokens from MockERC20 or uses pre-funded balances.
 */
contract MockSwapRouter is ISwapRouter {
    using SafeERC20 for IERC20;

    /// @notice Exchange rate: how many tokenOut per tokenIn (scaled by 1e18)
    /// Key: keccak256(abi.encodePacked(tokenIn, tokenOut))
    mapping(bytes32 => uint256) public rates;

    /// @notice Default rate if no specific rate set (1e18 = 1:1)
    uint256 public defaultRate = 1e18;

    /// @notice Slippage simulation: basis points to lose (e.g. 30 = 0.3%)
    uint256 public slippageBps = 0;

    event SwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address recipient
    );

    /**
     * @notice Set exchange rate for a specific pair.
     * @param tokenIn  Input token address.
     * @param tokenOut Output token address.
     * @param rate     Rate scaled by 1e18 (e.g. 1e18 = 1:1, 2e18 = 1 in : 2 out).
     */
    function setRate(address tokenIn, address tokenOut, uint256 rate) external {
        bytes32 key = keccak256(abi.encodePacked(tokenIn, tokenOut));
        rates[key] = rate;
    }

    /**
     * @notice Set default rate for all pairs without specific rates.
     */
    function setDefaultRate(uint256 rate) external {
        defaultRate = rate;
    }

    /**
     * @notice Set simulated slippage in basis points.
     */
    function setSlippage(uint256 bps) external {
        slippageBps = bps;
    }

    /**
     * @notice Get the effective rate for a pair (specific or default).
     */
    function getRate(address tokenIn, address tokenOut) public view returns (uint256) {
        bytes32 key = keccak256(abi.encodePacked(tokenIn, tokenOut));
        uint256 r = rates[key];
        return r > 0 ? r : defaultRate;
    }

    /**
     * @notice Simulate exactInputSingle swap.
     *         Pulls tokenIn from msg.sender, sends tokenOut to params.recipient.
     *         tokenOut must be pre-funded in this contract (via mint or transfer).
     */
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        require(params.amountIn > 0, "MockSwapRouter: zero amount");
        require(params.deadline >= block.timestamp, "MockSwapRouter: expired");

        // Pull input tokens from caller
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);

        // Calculate output based on rate
        uint256 rate = getRate(params.tokenIn, params.tokenOut);

        // Get decimals for both tokens to handle cross-decimal swaps
        uint8 decimalsIn = _getDecimals(params.tokenIn);
        uint8 decimalsOut = _getDecimals(params.tokenOut);

        // amountOut = amountIn * rate / 1e18, adjusted for decimal difference
        if (decimalsOut >= decimalsIn) {
            amountOut = (params.amountIn * rate * (10 ** (decimalsOut - decimalsIn))) / 1e18;
        } else {
            amountOut = (params.amountIn * rate) / (1e18 * (10 ** (decimalsIn - decimalsOut)));
        }

        // Apply slippage
        if (slippageBps > 0) {
            amountOut = amountOut * (10000 - slippageBps) / 10000;
        }

        require(amountOut >= params.amountOutMinimum, "MockSwapRouter: insufficient output");

        // Transfer output tokens to recipient
        IERC20(params.tokenOut).safeTransfer(params.recipient, amountOut);

        emit SwapExecuted(params.tokenIn, params.tokenOut, params.amountIn, amountOut, params.recipient);
    }

    /**
     * @dev Get decimals from an ERC20 token (with fallback to 18).
     */
    function _getDecimals(address token) internal view returns (uint8) {
        try IERC20Metadata(token).decimals() returns (uint8 d) {
            return d;
        } catch {
            return 18;
        }
    }
}

interface IERC20Metadata {
    function decimals() external view returns (uint8);
}
