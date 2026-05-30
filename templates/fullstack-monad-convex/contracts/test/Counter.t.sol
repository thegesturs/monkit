// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Counter} from "../src/Counter.sol";

contract CounterTest is Test {
    Counter internal counter;

    function setUp() public {
        counter = new Counter();
    }

    function test_StartsAtZero() public view {
        assertEq(counter.count(), 0);
    }

    function test_Increment() public {
        counter.increment();
        assertEq(counter.count(), 1);
    }

    function testFuzz_SetNumber(uint256 x) public {
        counter.setNumber(x);
        assertEq(counter.count(), x);
    }
}
