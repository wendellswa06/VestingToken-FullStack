import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract, ContractFactory, BigNumber } from "ethers";
import { ethers } from "hardhat";
import { before, it } from "mocha";


interface VestingScheduleParam {
    beneficiary: string; // address
    cliff: number;
    start: number;
    duration: number;
    slicePeriodSeconds: number;
    revocable: boolean;
    amountTotal: number;
    TGEPercentage: number;
    price: number;
}

const MAXSUPPLY: number = 5000000000;
const STARTTIME: number = 1622551248;

describe("TokenVesting", () => {
    let Token: ContractFactory;
    let USDT: ContractFactory;
    let usdt: Contract;
    let testToken: Contract;
    let TokenVesting: ContractFactory;
    let owner: SignerWithAddress;
    let addr1: SignerWithAddress;
    let addr2: SignerWithAddress;
    let addrs: SignerWithAddress[];
    

    before(async ()=> {
        Token = await ethers.getContractFactory("Web23Token");
        USDT = await ethers.getContractFactory("MockToken"); // for testings

        TokenVesting = await ethers.getContractFactory("MockTokenVesting");
    })

    beforeEach(async ()=> {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
        testToken = await Token.deploy();
        //deploying TokenVesting contract
        usdt = await USDT.deploy();
    })
        
    describe("Vesting", () => {
        it ("Should assign the total supply to the owner", async () => {
            const ownerBalance = await testToken.balanceOf(owner.address);
            expect(await testToken.totalSupply()).to.equal(ownerBalance);
        });

        //Seed Sale Round Testing
        it ("Seed Sale Round Testing", async() => {

            const tokenVesting = await TokenVesting.deploy(usdt.address, owner.address);
            await tokenVesting.deployed();
            await tokenVesting.setToken(testToken.address);
            expect((await tokenVesting.getToken()).toString()).to.equal(testToken.address);

            //send Tokens to the vesting contract
            await expect(testToken.transfer(tokenVesting.address, MAXSUPPLY))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, MAXSUPPLY);
            const vestingContractBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingContractBalance).to.equal(MAXSUPPLY);
            expect(await tokenVesting.getWithdrawableAmount()).to.equal(MAXSUPPLY);

            //Seed Sale Round Vesting
            let seedSaleRoundParam: VestingScheduleParam = {
                beneficiary: addr1.address,
                cliff: 6 * 30 * 24 * 3600, // 6 months in second
                start: STARTTIME, //'Mon, 19 Jan 1970 18:42:31 GMT'
                duration: 22 * 30 * 24 * 3600, // 22 months in second
                slicePeriodSeconds: 24 * 3600, // one day in second
                revocable: true, 
                amountTotal: MAXSUPPLY * 4 / 100, // 4.00% of Total Amount
                TGEPercentage: 3.00 * 100, // 3% at TGE
                price: 0.0060 * 10000 // price in USDT.
            }
            // transfer the total price of usdt to the beneficiary
            const amount = BigNumber.from(1200000).mul(BigNumber.from(10).pow(18));
            await (await usdt.transfer(addr1.address, amount.toString()));

            await tokenVesting.startVesting([seedSaleRoundParam]);
            expect(await tokenVesting.getVestingSchedulesCount()).to.be.equal(1);
            expect(
                await tokenVesting.getVestingSchedulesCountByBeneficiary(addr1.address)
            ).to.be.equal(1);
            
            //Compute vesting schedule id
            const vestingScheduleId = await tokenVesting.computeVestingScheduleIdForAddressAndIndex(addr1.address, 0);

            //Check that vested amount is 6000000
            expect(await tokenVesting.computeReleasableAmount(vestingScheduleId)).to.be.equal(6000000);
            
            //Set the time before cliff 
            const beforeCliff = STARTTIME + 6 * 30 * 24 * 3600 - 1;
            await tokenVesting.setCurrentTime(beforeCliff);

            //Check if the vested amount before cliff is the same as TGE: 6000000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(6000000);
            
            //Set the time to half the vesting period
            const halfTime = STARTTIME + 11 * 30 * 24 * 3600; // half vesting period = 11 * 30 * 24 * 3600;
            await tokenVesting.setCurrentTime(halfTime);

            //Check if the vested amount after cliff + half period is the as 6000000 + (200000000 - 6000000) / 2 = 103000000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(103000000);

            //Check that only beneficiary can try to release vested tokens
            await expect(tokenVesting.connect(addr2).release(vestingScheduleId, 200000000)).to.be.revertedWith(
                "TokenVesting: only beneficiary and owner can release vested tokens"
            );
            
            //Check if revoked, we can't release
            await tokenVesting.revoke(vestingScheduleId);
            await expect(tokenVesting.connect(addr1).release(vestingScheduleId, 1000000)).to.be.revertedWith(
                "revoked"
            );

            // release revoked
            await tokenVesting.releaseRevoked(vestingScheduleId);
            
            //Release 10000 tokens and check a Transfer event is emitted with a value of 10000
            expect(await tokenVesting.connect(addr1).release(vestingScheduleId, 10000))
            .to.emit(testToken, "Transfer")
            .withArgs(tokenVesting.address, addr1.address, 10000);
            
            //Check that the vested amount is now 103000000 - 10000 = 102990000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(102990000);

            let vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            //Check that the released amount is 10000
            expect(await vestingSchedule.released).to.be.equal(10000);

            //Set the time after the end of the vesting period
            const endTime = STARTTIME + 22 * 30 * 24 * 3600 + 1;
            await tokenVesting.setCurrentTime(endTime);

            //Check that the vested amount is now 200000000 - 10000 = 199990000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(199990000);

            //Beneficiary releases some amount of the vested tokens 99990000;
            await expect(await tokenVesting.connect(addr1).release(vestingScheduleId, 99990000))
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 99990000);
            
            //Owner releases some amount of the vested tokens 50000000
            await expect(await tokenVesting.connect(owner).release(vestingScheduleId, 50000000))
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 50000000);
            
            vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            //Check that the total number of released token is 150000000
            expect(vestingSchedule.released).to.be.equal(150000000);

            //Check that the vested amount is 50000000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(50000000);
            
            // Approve usdt
            const amountUsdt = BigNumber.from(300000).mul(BigNumber.from(10).pow(18));
            await (await usdt.connect(addr1).approve(tokenVesting.address, amountUsdt.toString()));
            //Claim the vested amount
            await expect(tokenVesting.connect(addr1).claim())
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 50000000);
            
            //Check that the vested amount is 0
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(0);
        })

        
        //Strategic Round Testing
        it ("Strategic Round Testing", async() => {
            //deploying TokenVesting contract
            const tokenVesting = await TokenVesting.deploy(usdt.address, owner.address);
            await tokenVesting.deployed();
            await tokenVesting.setToken(testToken.address);
            expect((await tokenVesting.getToken()).toString()).to.equal(testToken.address);

            //send Tokens to the vesting contract
            await expect(testToken.transfer(tokenVesting.address, MAXSUPPLY))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, MAXSUPPLY);
            const vestingContractBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingContractBalance).to.equal(MAXSUPPLY);
            expect(await tokenVesting.getWithdrawableAmount()).to.equal(MAXSUPPLY);

            //Seed Sale Round Vesting
            let seedSaleRoundParam: VestingScheduleParam = {
                beneficiary: addr1.address,
                cliff: 4 * 30 * 24 * 3600, // 4 months in second
                start: STARTTIME, //'Mon, 19 Jan 1970 18:42:31 GMT'
                duration: 18 * 30 * 24 * 3600, // 18 months in second
                slicePeriodSeconds: 24 * 3600, // one day in second
                revocable: true, 
                amountTotal: MAXSUPPLY * 7 / 100, // 7.00% of Total Amount
                TGEPercentage: 4.5 * 100, // 4.5% at TGE
                price: 0.0090 * 10000, //
            }
            // transfer the total price of usdt to the beneficiary
            const amount = BigNumber.from(3150000).mul(BigNumber.from(10).pow(18));
            await(await usdt.transfer(addr1.address, amount.toString()));
            
            await tokenVesting.startVesting([seedSaleRoundParam]);
            expect(await tokenVesting.getVestingSchedulesCount()).to.be.equal(1);
            expect(
                await tokenVesting.getVestingSchedulesCountByBeneficiary(addr1.address)
            ).to.be.equal(1);
            
            //Compute vesting schedule id
            const vestingScheduleId = await tokenVesting.computeVestingScheduleIdForAddressAndIndex(addr1.address, 0);

            //Check that vested amount is 15750000
            expect(await tokenVesting.computeReleasableAmount(vestingScheduleId)).to.be.equal(15750000);
            
            //Set the time before cliff 
            const beforeCliff = STARTTIME + 4 * 30 * 24 * 3600 - 1;
            await tokenVesting.setCurrentTime(beforeCliff);

            //Check if the vested amount before cliff is the same as TGE: 15750000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(15750000);
            
            //Set the time to half the vesting period
            const halfTime = STARTTIME + 9 * 30 * 24 * 3600; // half vesting period = 9 * 30 * 24 * 3600;
            await tokenVesting.setCurrentTime(halfTime);

            //Check if the vested amount after cliff + half period is the as 15750000 + (350000000 - 15750000) / 2 = 182875000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(182875000);

            //Check that only beneficiary can try to release vested tokens
            await expect(tokenVesting.connect(addr2).release(vestingScheduleId, 2000)).to.be.revertedWith(
                "TokenVesting: only beneficiary and owner can release vested tokens"
            );
            
            //Check if revoked, we can't release
            await tokenVesting.revoke(vestingScheduleId);
            await expect(tokenVesting.connect(addr1).release(vestingScheduleId, 1000000)).to.be.revertedWith(
                "revoked"
            );

            // release revoked
            await tokenVesting.releaseRevoked(vestingScheduleId);
            
            //Release 10000 tokens and check a Transfer event is emitted with a value of 1000
            expect(await tokenVesting.connect(addr1).release(vestingScheduleId, 1000))
            .to.emit(testToken, "Transfer")
            .withArgs(tokenVesting.address, addr1.address, 1000);
            
            //Check that the vested amount is now 182875000 - 1000 = 182874000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(182874000);

            let vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            //Check that the released amount is 1000
            expect(await vestingSchedule.released).to.be.equal(1000);

            //Set the time after the end of the vesting period
            const endTime = STARTTIME + 18 * 30 * 24 * 3600 + 1;
            await tokenVesting.setCurrentTime(endTime);

            //Check that the vested amount is now 350000000 - 1000 = 349999000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(349999000);

            //Beneficiary releases some amount of the vested tokens 49999000;
            await expect(await tokenVesting.connect(addr1).release(vestingScheduleId, 49999000))
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 49999000);
            
            //Owner releases some amount of the vested tokens 150000000
            await expect(await tokenVesting.connect(owner).release(vestingScheduleId, 150000000))
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 150000000);
            
            vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            //Check that the total number of released token is 200000000
            expect(vestingSchedule.released).to.be.equal(200000000);

            //Check that the vested amount is 50000000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(150000000);
            
            // Approve usdt
            const amountUsdt = BigNumber.from(1350000).mul(BigNumber.from(10).pow(18));
            await (await usdt.connect(addr1).approve(tokenVesting.address, amountUsdt.toString()));
          
            //Claim the vested amount
            await expect(tokenVesting.connect(addr1).claim())
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 150000000);
            
            //Check that the vested amount is 0
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(0);
        })

        
        //Private Round Testing
        it ("Private Round Testing", async() => {
            //deploying TokenVesting contract
            const tokenVesting = await TokenVesting.deploy(usdt.address, owner.address);
            await tokenVesting.deployed();
            await tokenVesting.setToken(testToken.address);
            expect((await tokenVesting.getToken()).toString()).to.equal(testToken.address);

            //send Tokens to the vesting contract
            await expect(testToken.transfer(tokenVesting.address, MAXSUPPLY))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, MAXSUPPLY);
            const vestingContractBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingContractBalance).to.equal(MAXSUPPLY);
            expect(await tokenVesting.getWithdrawableAmount()).to.equal(MAXSUPPLY);

            //Seed Sale Round Vesting
            let seedSaleRoundParam: VestingScheduleParam = {
                beneficiary: addr1.address,
                cliff: 2 * 30 * 24 * 3600, // 6 months in second
                start: STARTTIME, //'Mon, 19 Jan 1970 18:42:31 GMT'
                duration: 14 * 30 * 24 * 3600, // 22 months in second
                slicePeriodSeconds: 24 * 3600, // one day in second
                revocable: true, 
                amountTotal: MAXSUPPLY * 10 / 100, // 4.00% of Total Amount
                TGEPercentage: 6.00 * 100, // 3% at TGE
                price: 0.0120 * 1000
            }
            // transfer the total price of usdt to the beneficiary
            const amount = BigNumber.from(6000000).mul(BigNumber.from(10).pow(18));
            await (await usdt.transfer(addr1.address, amount.toString()));

            await tokenVesting.startVesting([seedSaleRoundParam]);
            expect(await tokenVesting.getVestingSchedulesCount()).to.be.equal(1);
            expect(
                await tokenVesting.getVestingSchedulesCountByBeneficiary(addr1.address)
            ).to.be.equal(1);
            
            //Compute vesting schedule id
            const vestingScheduleId = await tokenVesting.computeVestingScheduleIdForAddressAndIndex(addr1.address, 0);

            //Check that vested amount is 30000000
            expect(await tokenVesting.computeReleasableAmount(vestingScheduleId)).to.be.equal(30000000);
            
            //Set the time before cliff 
            const beforeCliff = STARTTIME + 2 * 30 * 24 * 3600 - 1;
            await tokenVesting.setCurrentTime(beforeCliff);

            //Check if the vested amount before cliff is the same as TGE: 30000000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(30000000);
            
            //Set the time to half the vesting period
            const halfTime = STARTTIME + 7 * 30 * 24 * 3600; // half vesting period = 7 * 30 * 24 * 3600;
            await tokenVesting.setCurrentTime(halfTime);

            //Check if the vested amount after cliff + half period is the as 30000000 + (500000000 - 30000000) / 2 = 265000000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(265000000);

            //Check that only beneficiary can try to release vested tokens
            await expect(tokenVesting.connect(addr2).release(vestingScheduleId, 10000)).to.be.revertedWith(
                "TokenVesting: only beneficiary and owner can release vested tokens"
            );
            
            //Check if revoked, we can't release
            await tokenVesting.revoke(vestingScheduleId);
            await expect(tokenVesting.connect(addr1).release(vestingScheduleId, 1000000)).to.be.revertedWith(
                "revoked"
            );

            // release revoked
            await tokenVesting.releaseRevoked(vestingScheduleId);
            
            //Release 10000 tokens and check a Transfer event is emitted with a value of 10000
            expect(await tokenVesting.connect(addr1).release(vestingScheduleId, 10000))
            .to.emit(testToken, "Transfer")
            .withArgs(tokenVesting.address, addr1.address, 10000);
            
            //Check that the vested amount is now 265000000 - 10000 = 
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(264990000);

            let vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            //Check that the released amount is 10000
            expect(await vestingSchedule.released).to.be.equal(10000);

            //Set the time after the end of the vesting period
            const endTime = STARTTIME + 14 * 30 * 24 * 3600 + 1;
            await tokenVesting.setCurrentTime(endTime);

            //Check that the vested amount is now 500000000 - 10000 = 499990000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(499990000);

            //Beneficiary releases some amount of the vested tokens 99990000;
            await expect(await tokenVesting.connect(addr1).release(vestingScheduleId, 99990000))
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 99990000);
            
            //Owner releases some amount of the vested tokens 250000000
            await expect(await tokenVesting.connect(owner).release(vestingScheduleId, 250000000))
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 250000000);
            
            vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            //Check that the total number of released token is 350000000
            expect(vestingSchedule.released).to.be.equal(350000000);

            //Check that the vested amount is 150000000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(150000000);
            
            // Approve usdt
            const amountUsdt = BigNumber.from(1800000).mul(BigNumber.from(10).pow(18));
            await (await usdt.connect(addr1).approve(tokenVesting.address, amountUsdt.toString()));

            //Claim the vested amount
            await expect(tokenVesting.connect(addr1).claim())
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 150000000);
            
            //Check that the vested amount is 0
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(0);
        })

        
        //Public Sale (IDO Round) Testing
        it ("Public Sale Round (IDO Round) Testing", async() => {
            //deploying TokenVesting contract
            const tokenVesting = await TokenVesting.deploy(usdt.address, owner.address);
            await tokenVesting.deployed();
            await tokenVesting.setToken(testToken.address);
            expect((await tokenVesting.getToken()).toString()).to.equal(testToken.address);

            //send Tokens to the vesting contract
            await expect(testToken.transfer(tokenVesting.address, MAXSUPPLY))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, MAXSUPPLY);
            const vestingContractBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingContractBalance).to.equal(MAXSUPPLY);
            expect(await tokenVesting.getWithdrawableAmount()).to.equal(MAXSUPPLY);

            //Seed Sale Round Vesting
            let seedSaleRoundParam: VestingScheduleParam = {
                beneficiary: addr1.address,
                cliff: 0, // 0 months in second
                start: STARTTIME, //'Mon, 19 Jan 1970 18:42:31 GMT'
                duration: 8 * 30 * 24 * 3600, // 8 months in second
                slicePeriodSeconds: 24 * 3600, // one day in second
                revocable: true, 
                amountTotal: MAXSUPPLY * 0.5 / 100, // 0.50% of Total Amount
                TGEPercentage: 18.00 * 100, // 18% at TGE
                price: 0.0160 * 10000
            }
            // Transfer the total amount of USDT token to the beneficiary
            const amount = BigNumber.from(400000).mul(BigNumber.from(10).pow(18));
            await(await usdt.transfer(addr1.address, amount.toString()));

            await tokenVesting.startVesting([seedSaleRoundParam]);
            expect(await tokenVesting.getVestingSchedulesCount()).to.be.equal(1);
            expect(
                await tokenVesting.getVestingSchedulesCountByBeneficiary(addr1.address)
            ).to.be.equal(1);
            
            //Compute vesting schedule id
            const vestingScheduleId = await tokenVesting.computeVestingScheduleIdForAddressAndIndex(addr1.address, 0);

            //Check that vested amount is 4500000
            expect(await tokenVesting.computeReleasableAmount(vestingScheduleId)).to.be.equal(4500000);
            
            //Set the time before cliff 
            const beforeCliff = STARTTIME - 1;
            await tokenVesting.setCurrentTime(beforeCliff);

            //Check if the vested amount before cliff is the same as TGE: 4500000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(4500000);
            
            //Set the time to half the vesting period
            const halfTime = STARTTIME + 4 * 30 * 24 * 3600; // half vesting period = 4 * 30 * 24 * 3600;
            await tokenVesting.setCurrentTime(halfTime);

            //Check if the vested amount after cliff + half period is the as 4500000 + (25000000 - 4500000) / 2 = 14750000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(14750000);

            //Check that only beneficiary can try to release vested tokens
            await expect(tokenVesting.connect(addr2).release(vestingScheduleId, 200000)).to.be.revertedWith(
                "TokenVesting: only beneficiary and owner can release vested tokens"
            );
            
            //Check if revoked, we can't release
            await tokenVesting.revoke(vestingScheduleId);
            await expect(tokenVesting.connect(addr1).release(vestingScheduleId, 10000)).to.be.revertedWith(
                "revoked"
            );

            // release revoked
            await tokenVesting.releaseRevoked(vestingScheduleId);
            
            //Release 10000 tokens and check a Transfer event is emitted with a value of 10000
            expect(await tokenVesting.connect(addr1).release(vestingScheduleId, 10000))
            .to.emit(testToken, "Transfer")
            .withArgs(tokenVesting.address, addr1.address, 10000);
            
            //Check that the vested amount is now 14750000 - 10000 = 14740000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(14740000);

            let vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            //Check that the released amount is 10000
            expect(await vestingSchedule.released).to.be.equal(10000);

            //Set the time after the end of the vesting period
            const endTime = STARTTIME + 14 * 30 * 24 * 3600 + 1;
            await tokenVesting.setCurrentTime(endTime);

            //Check that the vested amount is now 25000000 - 10000 = 24990000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(24990000);

            //Beneficiary releases some amount of the vested tokens 99990000;
            await expect(await tokenVesting.connect(addr1).release(vestingScheduleId, 990000))
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 990000);
            
            //Owner releases some amount of the vested tokens 4000000
            await expect(await tokenVesting.connect(owner).release(vestingScheduleId, 4000000))
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 4000000);
            
            vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            //Check that the total number of released token is 5000000
            expect(vestingSchedule.released).to.be.equal(5000000);

            //Check that the vested amount is 20000000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(20000000);

            // Approve usdt
            const amountUsdt = BigNumber.from(320000).mul(BigNumber.from(10).pow(18));
            await (await usdt.connect(addr1).approve(tokenVesting.address, amountUsdt.toString()));
            
            //Claim the vested amount
            await expect(tokenVesting.connect(addr1).claim())
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 20000000);
            
            //Check that the vested amount is 0
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(0);
        })
        
        
        //Advisory Testing
        it ("Advisory Testing", async() => {
            //deploying TokenVesting contract
            const tokenVesting = await TokenVesting.deploy(usdt.address, owner.address);
            await tokenVesting.deployed();
            await tokenVesting.setToken(testToken.address);
            expect((await tokenVesting.getToken()).toString()).to.equal(testToken.address);

            //send Tokens to the vesting contract
            await expect(testToken.transfer(tokenVesting.address, MAXSUPPLY))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, MAXSUPPLY);
            const vestingContractBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingContractBalance).to.equal(MAXSUPPLY);
            expect(await tokenVesting.getWithdrawableAmount()).to.equal(MAXSUPPLY);

            //Seed Sale Round Vesting
            let seedSaleRoundParam: VestingScheduleParam = {
                beneficiary: addr1.address,
                cliff: 8 * 30 * 24 * 3600, // 8 months in second
                start: STARTTIME, //'Mon, 19 Jan 1970 18:42:31 GMT'
                duration: 18 * 30 * 24 * 3600, // 8 months in second
                slicePeriodSeconds: 24 * 3600, // one day in second
                revocable: true, 
                amountTotal: MAXSUPPLY * 10 / 100, // 0.50% of Total Amount
                TGEPercentage: 0, // 0% at TGE
                price: 0
            }
            
            await tokenVesting.startVesting([seedSaleRoundParam]);
            expect(await tokenVesting.getVestingSchedulesCount()).to.be.equal(1);
            expect(
                await tokenVesting.getVestingSchedulesCountByBeneficiary(addr1.address)
            ).to.be.equal(1);
            
            //Compute vesting schedule id
            const vestingScheduleId = await tokenVesting.computeVestingScheduleIdForAddressAndIndex(addr1.address, 0);

            //Check that vested amount is 0
            expect(await tokenVesting.computeReleasableAmount(vestingScheduleId)).to.be.equal(0);
            
            //Set the time before cliff 
            const beforeCliff = STARTTIME + 8 * 30 * 24 * 3600 - 1;
            await tokenVesting.setCurrentTime(beforeCliff);

            //Check if the vested amount before cliff is the same as TGE: 0
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(0);
            
            //Set the time to half the vesting period
            const halfTime = STARTTIME + 9 * 30 * 24 * 3600; // half vesting period = 9 * 30 * 24 * 3600;
            await tokenVesting.setCurrentTime(halfTime);

            //Check if the vested amount after cliff + half period is the as 0 + (500000000 - 0) / 2 = 250000000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(250000000);

            //Check that only beneficiary can try to release vested tokens
            await expect(tokenVesting.connect(addr2).release(vestingScheduleId, 200000)).to.be.revertedWith(
                "TokenVesting: only beneficiary and owner can release vested tokens"
            );
            
            //Check if revoked, we can't release
            await tokenVesting.revoke(vestingScheduleId);
            await expect(tokenVesting.connect(addr1).release(vestingScheduleId, 10000)).to.be.revertedWith(
                "revoked"
            );

            // release revoked
            await tokenVesting.releaseRevoked(vestingScheduleId);
            
            //Release 10000 tokens and check a Transfer event is emitted with a value of 10000
            expect(await tokenVesting.connect(addr1).release(vestingScheduleId, 10000))
            .to.emit(testToken, "Transfer")
            .withArgs(tokenVesting.address, addr1.address, 10000);
            
            //Check that the vested amount is now 250000000 - 10000 = 249990000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(249990000);

            let vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            //Check that the released amount is 10000
            expect(await vestingSchedule.released).to.be.equal(10000);

            //Set the time after the end of the vesting period
            const endTime = STARTTIME + 18 * 30 * 24 * 3600 + 1;
            await tokenVesting.setCurrentTime(endTime);

            //Check that the vested amount is now 500000000 - 10000 = 449990000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(499990000);

            //Beneficiary releases some amount of the vested tokens 99900000;
            await expect(await tokenVesting.connect(addr1).release(vestingScheduleId, 99990000))
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 99990000);
            
            //Owner releases some amount of the vested tokens 400000000
            await expect(await tokenVesting.connect(owner).release(vestingScheduleId, 400000000))
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 400000000);
            
            vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            //Check that the total number of released token is 500000000
            expect(vestingSchedule.released).to.be.equal(500000000);

            //Check that the vested amount is 0
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(0);  
        })

        
        //Strategic Partnerships Testing
        it ("Strategic Partnerships Testing", async() => {
            //deploying TokenVesting contract
            const tokenVesting = await TokenVesting.deploy(usdt.address, owner.address);
            await tokenVesting.deployed();
            await tokenVesting.setToken(testToken.address);
            expect((await tokenVesting.getToken()).toString()).to.equal(testToken.address);

            //send Tokens to the vesting contract
            await expect(testToken.transfer(tokenVesting.address, MAXSUPPLY))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, MAXSUPPLY);
            const vestingContractBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingContractBalance).to.equal(MAXSUPPLY);
            expect(await tokenVesting.getWithdrawableAmount()).to.equal(MAXSUPPLY);

            //Seed Sale Round Vesting
            let seedSaleRoundParam: VestingScheduleParam = {
                beneficiary: addr1.address,
                cliff: 4 * 30 * 24 * 3600, // 4 months in second
                start: STARTTIME, //'Mon, 19 Jan 1970 18:42:31 GMT'
                duration: 18 * 30 * 24 * 3600, // 18 months in second
                slicePeriodSeconds: 24 * 3600, // one day in second
                revocable: true, 
                amountTotal: MAXSUPPLY * 5 / 100, // 5.0% of Total Amount
                TGEPercentage: 0.00 * 100, // 0% at TGE
                price: 0
            }
            
            await tokenVesting.startVesting([seedSaleRoundParam]);
            expect(await tokenVesting.getVestingSchedulesCount()).to.be.equal(1);
            expect(
                await tokenVesting.getVestingSchedulesCountByBeneficiary(addr1.address)
            ).to.be.equal(1);
            
            //Compute vesting schedule id
            const vestingScheduleId = await tokenVesting.computeVestingScheduleIdForAddressAndIndex(addr1.address, 0);

            //Check that vested amount is 0
            expect(await tokenVesting.computeReleasableAmount(vestingScheduleId)).to.be.equal(0);
            
            //Set the time before cliff 
            const beforeCliff = STARTTIME - 1;
            await tokenVesting.setCurrentTime(beforeCliff);

            //Check if the vested amount before cliff is the same as TGE: 0
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(0);
            
            //Set the time to half the vesting period
            const halfTime = STARTTIME + 9 * 30 * 24 * 3600; // half vesting period = 4 * 30 * 24 * 3600;
            await tokenVesting.setCurrentTime(halfTime);

            //Check if the vested amount after cliff + half period is the as (250000000) / 2 = 125000000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(125000000);

            //Check that only beneficiary can try to release vested tokens
            await expect(tokenVesting.connect(addr2).release(vestingScheduleId, 200000)).to.be.revertedWith(
                "TokenVesting: only beneficiary and owner can release vested tokens"
            );
            
            //Check if revoked, we can't release
            await tokenVesting.revoke(vestingScheduleId);
            await expect(tokenVesting.connect(addr1).release(vestingScheduleId, 10000)).to.be.revertedWith(
                "revoked"
            );

            // release revoked
            await tokenVesting.releaseRevoked(vestingScheduleId);
            
            //Release 10000 tokens and check a Transfer event is emitted with a value of 10000
            expect(await tokenVesting.connect(addr1).release(vestingScheduleId, 10000))
            .to.emit(testToken, "Transfer")
            .withArgs(tokenVesting.address, addr1.address, 10000);
            
            //Check that the vested amount is now 12500000 - 10000 = 124990000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(124990000);

            let vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            //Check that the released amount is 10000
            expect(await vestingSchedule.released).to.be.equal(10000);

            //Set the time after the end of the vesting period
            const endTime = STARTTIME + 18 * 30 * 24 * 3600 + 1;
            await tokenVesting.setCurrentTime(endTime);

            //Check that the vested amount is now 250000000 - 10000 = 249990000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(249990000);

            //Beneficiary releases some amount of the vested tokens 9990000;
            await expect(await tokenVesting.connect(addr1).release(vestingScheduleId, 9990000))
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 9990000);
            
            //Owner releases some amount of the vested tokens 40000000
            await expect(await tokenVesting.connect(owner).release(vestingScheduleId, 40000000))
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 40000000);
            
            vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            //Check that the total number of released token is 50000000
            expect(vestingSchedule.released).to.be.equal(50000000);

            //Check that the vested amount is 200000000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(200000000);
            
            //Claim the vested amount
            await expect(tokenVesting.connect(addr1).claim())
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 200000000);
            
            //Check that the vested amount is 0
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(0);
        })

        
        // Marketing / dApp Growth Testing
        it ("Marketing / dApp Growth Testing", async() => {
            //deploying TokenVesting contract
            const tokenVesting = await TokenVesting.deploy(usdt.address, owner.address);
            await tokenVesting.deployed();
            await tokenVesting.setToken(testToken.address);
            expect((await tokenVesting.getToken()).toString()).to.equal(testToken.address);

            //send Tokens to the vesting contract
            await expect(testToken.transfer(tokenVesting.address, MAXSUPPLY))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, MAXSUPPLY);
            const vestingContractBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingContractBalance).to.equal(MAXSUPPLY);
            expect(await tokenVesting.getWithdrawableAmount()).to.equal(MAXSUPPLY);

            //Seed Sale Round Vesting
            let seedSaleRoundParam: VestingScheduleParam = {
                beneficiary: addr1.address,
                cliff: 3 * 30 * 24 * 3600, // 4 months in second
                start: STARTTIME, //'Mon, 19 Jan 1970 18:42:31 GMT'
                duration: 18 * 30 * 24 * 3600, // 18 months in second
                slicePeriodSeconds: 24 * 3600, // one day in second
                revocable: true, 
                amountTotal: MAXSUPPLY * 5 / 100, // 5.0% of Total Amount
                TGEPercentage: 0.00 * 100, // 0% at TGE
                price: 0
            }
            
            await tokenVesting.startVesting([seedSaleRoundParam]);
            expect(await tokenVesting.getVestingSchedulesCount()).to.be.equal(1);
            expect(
                await tokenVesting.getVestingSchedulesCountByBeneficiary(addr1.address)
            ).to.be.equal(1);
            
            //Compute vesting schedule id
            const vestingScheduleId = await tokenVesting.computeVestingScheduleIdForAddressAndIndex(addr1.address, 0);

            //Check that vested amount is 0
            expect(await tokenVesting.computeReleasableAmount(vestingScheduleId)).to.be.equal(0);
            
            //Set the time before cliff 
            const beforeCliff = STARTTIME + 3 * 30 * 24 * 3600 - 1;
            await tokenVesting.setCurrentTime(beforeCliff);

            //Check if the vested amount before cliff is the same as TGE: 0
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(0);
            
            //Set the time to half the vesting period
            const halfTime = STARTTIME + 9 * 30 * 24 * 3600; // half vesting period = 4 * 30 * 24 * 3600;
            await tokenVesting.setCurrentTime(halfTime);

            //Check if the vested amount after cliff + half period is the as (250000000) / 2 = 125000000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(125000000);

            //Check that only beneficiary can try to release vested tokens
            await expect(tokenVesting.connect(addr2).release(vestingScheduleId, 200000)).to.be.revertedWith(
                "TokenVesting: only beneficiary and owner can release vested tokens"
            );
            
            //Check if revoked, we can't release
            await tokenVesting.revoke(vestingScheduleId);
            await expect(tokenVesting.connect(addr1).release(vestingScheduleId, 10000)).to.be.revertedWith(
                "revoked"
            );

            // release revoked
            await tokenVesting.releaseRevoked(vestingScheduleId);
            
            //Release 10000 tokens and check a Transfer event is emitted with a value of 10000
            expect(await tokenVesting.connect(addr1).release(vestingScheduleId, 10000))
            .to.emit(testToken, "Transfer")
            .withArgs(tokenVesting.address, addr1.address, 10000);
            
            //Check that the vested amount is now 12500000 - 10000 = 124990000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(124990000);

            let vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            //Check that the released amount is 10000
            expect(await vestingSchedule.released).to.be.equal(10000);

            //Set the time after the end of the vesting period
            const endTime = STARTTIME + 18 * 30 * 24 * 3600 + 1;
            await tokenVesting.setCurrentTime(endTime);

            //Check that the vested amount is now 250000000 - 10000 = 249990000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(249990000);

            //Beneficiary releases some amount of the vested tokens 9990000;
            await expect(await tokenVesting.connect(addr1).release(vestingScheduleId, 9990000))
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 9990000);
            
            //Owner releases some amount of the vested tokens 40000000
            await expect(await tokenVesting.connect(owner).release(vestingScheduleId, 40000000))
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 40000000);
            
            vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            //Check that the total number of released token is 50000000
            expect(vestingSchedule.released).to.be.equal(50000000);

            //Check that the vested amount is 200000000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(200000000);
            
            //Claim the vested amount
            await expect(tokenVesting.connect(addr1).claim())
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 200000000);
            
            //Check that the vested amount is 0
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(0);
        })

        // Team Tokens Testing
        it ("Team Tokens Testing", async() => {
            //deploying TokenVesting contract
            const tokenVesting = await TokenVesting.deploy(usdt.address, owner.address);
            await tokenVesting.deployed();
            await tokenVesting.setToken(testToken.address);
            expect((await tokenVesting.getToken()).toString()).to.equal(testToken.address);

            //send Tokens to the vesting contract
            await expect(testToken.transfer(tokenVesting.address, MAXSUPPLY))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, MAXSUPPLY);
            const vestingContractBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingContractBalance).to.equal(MAXSUPPLY);
            expect(await tokenVesting.getWithdrawableAmount()).to.equal(MAXSUPPLY);

            //Seed Sale Round Vesting
            let seedSaleRoundParam: VestingScheduleParam = {
                beneficiary: addr1.address,
                cliff: 12 * 30 * 24 * 3600, // 4 months in second
                start: STARTTIME, //'Mon, 19 Jan 1970 18:42:31 GMT'
                duration: 24 * 30 * 24 * 3600, // 18 months in second
                slicePeriodSeconds: 24 * 3600, // one day in second
                revocable: true, 
                amountTotal: MAXSUPPLY * 12 / 100, // 5.0% of Total Amount
                TGEPercentage: 0.00 * 100, // 0% at TGE
                price: 0
            }
            
            await tokenVesting.startVesting([seedSaleRoundParam]);
            expect(await tokenVesting.getVestingSchedulesCount()).to.be.equal(1);
            expect(
                await tokenVesting.getVestingSchedulesCountByBeneficiary(addr1.address)
            ).to.be.equal(1);
            
            //Compute vesting schedule id
            const vestingScheduleId = await tokenVesting.computeVestingScheduleIdForAddressAndIndex(addr1.address, 0);

            //Check that vested amount is 0
            expect(await tokenVesting.computeReleasableAmount(vestingScheduleId)).to.be.equal(0);
            
            //Set the time before cliff 
            const beforeCliff = STARTTIME + 12 * 30 * 24 * 3600 - 1;
            await tokenVesting.setCurrentTime(beforeCliff);

            //Check if the vested amount before cliff is the same as TGE: 0
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(0);
            
            //Set the time to half the vesting period
            const halfTime = STARTTIME + 12 * 30 * 24 * 3600; // half vesting period = 12 * 30 * 24 * 3600;
            await tokenVesting.setCurrentTime(halfTime);

            //Check if the vested amount after cliff + half period is the as (600000000) / 2 = 300000000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(300000000);

            //Check that only beneficiary can try to release vested tokens
            await expect(tokenVesting.connect(addr2).release(vestingScheduleId, 200000)).to.be.revertedWith(
                "TokenVesting: only beneficiary and owner can release vested tokens"
            );
            
            //Check if revoked, we can't release
            await tokenVesting.revoke(vestingScheduleId);
            await expect(tokenVesting.connect(addr1).release(vestingScheduleId, 10000)).to.be.revertedWith(
                "revoked"
            );

            // release revoked
            await tokenVesting.releaseRevoked(vestingScheduleId);
            
            //Release 10000 tokens and check a Transfer event is emitted with a value of 10000
            expect(await tokenVesting.connect(addr1).release(vestingScheduleId, 10000))
            .to.emit(testToken, "Transfer")
            .withArgs(tokenVesting.address, addr1.address, 10000);
            
            //Check that the vested amount is now 30000000 - 10000 = 299990000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(299990000);

            let vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            //Check that the released amount is 10000
            expect(await vestingSchedule.released).to.be.equal(10000);

            //Set the time after the end of the vesting period
            const endTime = STARTTIME + 24 * 30 * 24 * 3600 + 1;
            await tokenVesting.setCurrentTime(endTime);

            //Check that the vested amount is now 600000000 - 10000 = 599990000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(599990000);

            //Beneficiary releases some amount of the vested tokens 99990000;
            await expect(await tokenVesting.connect(addr1).release(vestingScheduleId, 99990000))
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 99990000);
            
            //Owner releases some amount of the vested tokens 400000000
            await expect(await tokenVesting.connect(owner).release(vestingScheduleId, 400000000))
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 400000000);
            
            vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            //Check that the total number of released token is 500000000
            expect(vestingSchedule.released).to.be.equal(500000000);

            //Check that the vested amount is 100000000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(100000000);
            
            //Claim the vested amount
            await expect(tokenVesting.connect(addr1).claim())
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 100000000);
            
            //Check that the vested amount is 0
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(0);
        })

        // Ecosystem Testing
        it ("Ecosystem Testing", async() => {
            //deploying TokenVesting contract
            const tokenVesting = await TokenVesting.deploy(usdt.address, owner.address);
            await tokenVesting.deployed();
            await tokenVesting.setToken(testToken.address);
            expect((await tokenVesting.getToken()).toString()).to.equal(testToken.address);

            //send Tokens to the vesting contract
            await expect(testToken.transfer(tokenVesting.address, MAXSUPPLY))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, MAXSUPPLY);
            const vestingContractBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingContractBalance).to.equal(MAXSUPPLY);
            expect(await tokenVesting.getWithdrawableAmount()).to.equal(MAXSUPPLY);

            //Seed Sale Round Vesting
            let seedSaleRoundParam: VestingScheduleParam = {
                beneficiary: addr1.address,
                cliff: 1 * 30 * 24 * 3600, // 4 months in second
                start: STARTTIME, //'Mon, 19 Jan 1970 18:42:31 GMT'
                duration: 35 * 30 * 24 * 3600, // 18 months in second
                slicePeriodSeconds: 24 * 3600, // one day in second
                revocable: true, 
                amountTotal: MAXSUPPLY * 35 / 100, // 5.0% of Total Amount
                TGEPercentage: 0.00 * 100, // 0% at TGE
                price: 0
            }
            
            await tokenVesting.startVesting([seedSaleRoundParam]);
            expect(await tokenVesting.getVestingSchedulesCount()).to.be.equal(1);
            expect(
                await tokenVesting.getVestingSchedulesCountByBeneficiary(addr1.address)
            ).to.be.equal(1);
            
            //Compute vesting schedule id
            const vestingScheduleId = await tokenVesting.computeVestingScheduleIdForAddressAndIndex(addr1.address, 0);

            //Check that vested amount is 0
            expect(await tokenVesting.computeReleasableAmount(vestingScheduleId)).to.be.equal(0);
            
            //Set the time before cliff 
            const beforeCliff = STARTTIME + 1 * 30 * 24 * 3600 - 1;
            await tokenVesting.setCurrentTime(beforeCliff);

            //Check if the vested amount before cliff is the same as TGE: 0
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(0);
            
            //Set the time to half the vesting period
            const halfTime = STARTTIME + 17.5 * 30 * 24 * 3600; // half vesting period = 17.5 * 30 * 24 * 3600;
            await tokenVesting.setCurrentTime(halfTime);

            //Check if the vested amount after cliff + half period is the as (1750000000) / 2 = 875000000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(875000000);

            //Check that only beneficiary can try to release vested tokens
            await expect(tokenVesting.connect(addr2).release(vestingScheduleId, 200000)).to.be.revertedWith(
                "TokenVesting: only beneficiary and owner can release vested tokens"
            );
            
            //Check if revoked, we can't release
            await tokenVesting.revoke(vestingScheduleId);
            await expect(tokenVesting.connect(addr1).release(vestingScheduleId, 10000)).to.be.revertedWith(
                "revoked"
            );

            // release revoked
            await tokenVesting.releaseRevoked(vestingScheduleId);
            
            //Release 10000 tokens and check a Transfer event is emitted with a value of 10000
            expect(await tokenVesting.connect(addr1).release(vestingScheduleId, 10000))
            .to.emit(testToken, "Transfer")
            .withArgs(tokenVesting.address, addr1.address, 10000);
            
            //Check that the vested amount is now 875000000 - 10000 = 874990000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(874990000);

            let vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            //Check that the released amount is 10000
            expect(await vestingSchedule.released).to.be.equal(10000);

            //Set the time after the end of the vesting period
            const endTime = STARTTIME + 35 * 30 * 24 * 3600 + 1;
            await tokenVesting.setCurrentTime(endTime);

            //Check that the vested amount is now 1750000000 - 10000 = 1749990000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(1749990000);

            //Beneficiary releases some amount of the vested tokens 9990000;
            await expect(await tokenVesting.connect(addr1).release(vestingScheduleId, 9990000))
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 9990000);
            
            //Owner releases some amount of the vested tokens 40000000
            await expect(await tokenVesting.connect(owner).release(vestingScheduleId, 40000000))
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 40000000);
            
            vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            //Check that the total number of released token is 50000000
            expect(vestingSchedule.released).to.be.equal(50000000);

            //Check that the vested amount is 1700000000
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(1700000000);
            
            //Claim the vested amount
            await expect(tokenVesting.connect(addr1).claim())
                .to.emit(testToken, "Transfer")
                .withArgs(tokenVesting.address, addr1.address, 1700000000);
            
            //Check that the vested amount is 0
            expect(await tokenVesting.connect(addr1).computeReleasableAmount(vestingScheduleId)).to.be.equal(0);
        })
    })
})