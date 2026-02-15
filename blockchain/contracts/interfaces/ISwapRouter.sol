// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;

/**
 * @title ISwapRouter
 * @notice Minimal interface for Uniswap V3 / QuickSwap V3 SwapRouter.
 *         Used by PROPMETRIKPayments for on-chain token swaps when a
 *         recipient's preferred token differs from the payment token.
 *
 *         QuickSwap V3 on Polygon uses the same interface as Uniswap V3.
 *         Router address on Polygon mainnet: 0xf5b509bB0909a69B1c207E495f687a596C168E12
 */
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24  fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    /// @notice Swaps `amountIn` of one token for as much as possible of another token.
    /// @param params The parameters necessary for the swap, encoded as `ExactInputSingleParams`.
    /// @return amountOut The amount of the received token.
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}
