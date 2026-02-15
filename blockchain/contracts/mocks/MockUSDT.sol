// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockERC20
 * @notice Configurable mock ERC20 for testing multi-token payments.
 *         Supports arbitrary name, symbol, and decimal count.
 */
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/**
 * @title MockUSDT
 * @notice Backwards-compatible alias — 6-decimal USDT mock.
 */
contract MockUSDT is MockERC20 {
    constructor() MockERC20("Mock USDT", "USDT", 6) {}
}
