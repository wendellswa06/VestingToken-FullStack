// SPDX-License-Identifier: MIT

pragma solidity 0.8.16;

import "./TokenVesting.sol";

/**
 * @title MockTokenVesting
 * WARNING: use only for testing and debugging purpose
 */

contract MockTokenVesting is TokenVesting {
    uint256 mockTime = 0;
    
    constructor(address USDT_, address admin_) TokenVesting(USDT_, admin_) {
    }

    function setCurrentTime(uint256 _time) 
        external {
        mockTime = _time;
    }

    function getCurrentTime()
        internal
        virtual
        override
        view
        returns (uint256) {
            return mockTime;
    }
}