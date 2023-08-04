<a name="readme-top"></a>

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <h1 align="center">Create NFT as well as FT Token Smart Contracts based on Tokenomics Provided Deployed On BNB Chain</h1>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#system-requirements">System Requirements</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->

## About The Project

This is a smart contract that creates the FT based on Tokenomics and implements the token vesting.

<!-- GETTING STARTED -->

## Getting Started

### System Requirements
- [NodeJS][node] v14 or greater
- Solidity version 0.8.16 or higher
- the .env file should include mneomonic words of wallet.

### Installation

```js
npm install
ren .env.example .env
```
### Compliling
```
npx hardhat compile
```
### Deploying on the different blockchain (BNB testnet, mainnet or localhost)
```
npx hardhat run --network localhost scripts/0_deploy.localhost.ts
npx hardhat run --network testnet scripts/1_deploy.testnet.ts
npx hardhat run --network mainnet scripts/2_deploy.mainnet.ts
```
### Testing
```
npx hardhat test
```
## Caution
- If you try to deploy the smart contracts on the mainnet or testnet, your wallet (corresponding to the mneomonic words) has the sufficient BNB token or test token.
- If you want to deploy the smart contracts on the other blockchain network, please change the haradhat.config.ts.

