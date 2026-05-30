// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Counter
/// @notice A minimal starter contract. The on-chain value lives here; the
///         leaderboard / profiles live off-chain in Convex (see ../../frontend/convex).
contract Counter {
    uint256 public count;

    event Incremented(address indexed by, uint256 newCount);

    /// @notice Increment the on-chain counter by one.
    function increment() external {
        count += 1;
        emit Incremented(msg.sender, count);
    }

    /// @notice Set the counter to an explicit value.
    function setNumber(uint256 newCount) external {
        count = newCount;
    }
}
