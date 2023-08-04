// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { Contract, ContractFactory } from "ethers";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("deploying with the account ", deployer.address);

  const Token = await ethers.getContractFactory("Web23Token");
  const token = await Token.deploy();
  await token.deployed();
  console.log("Token address = ", token.address);

  const USDT = "0x55d398326f99059ff775485246999027b3197955"; //USDT address on BNB mainnet
  const ADMIN = "0x13a986323Bf7D8cA7477fB0a8603aB5E6928f8BD"; //wallet address of admin
  const TokenVesting = await ethers.getContractFactory('TokenVesting');
  const tokenVesting = await TokenVesting.deploy(USDT, ADMIN);
  await tokenVesting.deployed();
  console.log("Token Vesting address = ", tokenVesting.address);

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
