// SPDX-License-Identifier: MIT

pragma solidity 0.8.16;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


/**
 * @title This token should be used in testing or fixing errors
 */
contract MockToken is ERC20Pausable, Ownable  {
    uint256 private constant MAXSUPPLY = 500000000000*10**18;
    constructor() ERC20("MOCK Token", "usdt")  {
        _mint(msg.sender, MAXSUPPLY); 
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}