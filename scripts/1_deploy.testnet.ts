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
  //Token address => 0x13A77FfE48e93c100038d8De2A516c92d9145C49

  const USDT = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd"; //USDT address on BNB testnet
  const ADMIN = "0x13a986323Bf7D8cA7477fB0a8603aB5E6928f8BD"; //wallet address of admin
  const TokenVesting = await ethers.getContractFactory('TokenVesting');
  const tokenVesting = await TokenVesting.deploy(USDT, ADMIN);
  await tokenVesting.deployed();
  console.log("Token Vesting address = ", tokenVesting.address);
  //TokenVesting address => 0x607E03bD22a8Cc112486b24334d5C443E1314148
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
