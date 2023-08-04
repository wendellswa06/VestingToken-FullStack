// SPDX-License-Identifier: MIT

pragma solidity 0.8.16;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Web23Token is ERC20Pausable, Ownable  {
    uint256 private constant MAXSUPPLY = 5000000000*10**18;
    constructor() ERC20("Web23 Token", "WEB23")  {
        _mint(msg.sender, MAXSUPPLY); // 5 B
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}