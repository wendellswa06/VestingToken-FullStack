import React, {useEffect, useState, useSyncExternalStore} from 'react';
import {Contract, ethers} from "ethers";
import {BigNumber} from "ethers";
import vestingToken from "./contracts/MockTokenTesting.sol/MockTokenVesting.json"
import usdtToken from "./contracts/MockToken.sol/MockToken.json";
import './App.css';

type IVestingParams = "beneficiary" | "cliff" | "start" | "duration" | "slicePeriodSeconds" | "revocable" | "amountTotal" | "TGEPercentage" | "price"

let tokenVesting: Contract
let mockToken: Contract
const MAXSUPPLY: number = 5000000000;
const STARTTIME: number = 1675301035;

type IAddress = "Web23Token" | "VestingToken" | "USDTToken" | "Admin" | "Beneficiary";

const addresses = {
  "Admin": "0x13a986323Bf7D8cA7477fB0a8603aB5E6928f8BD",
  "Beneficiary": "0xaeeB788F4CEe1119C7A89Ec00EeBCd638Fc0fca6",
  "Web23Token": "0xFc3CCb454aAAD18cf8dd823115D1358CC0fAF721", 
  "USDTToken": "0xdCA2A8Acad8701dE0Da44471dC7BC3034326518D",
  "VestingToken": "0x6BB866EEC39d047DC0aA28793eD0972BEd3B8858",
}

const vestingParams =
{
  "beneficiary": "0xaeeB788F4CEe1119C7A89Ec00EeBCd638Fc0fca6",
  "cliff": "6 month", 
  "start": "2/1/2023",
  "duration": "22 month",
  "slicePeriodSeconds": "1 day",
  "revocable": "true", 
  "amountTotal": 200000000,
  "TGEPercentage": "3%",
  "price": "0.060"    
}

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

let seedSaleRoundParam: VestingScheduleParam = {
  beneficiary: vestingParams.beneficiary,
  cliff: 6 * 30 * 24 * 3600 , // 6 months in second
  start: STARTTIME, //'Mon, 19 Jan 1970 18:42:31 GMT'
  duration: 22 * 30 * 24 * 3600, // 22 months in second
  slicePeriodSeconds: 60, // one day in second
  revocable: true, 
  amountTotal: MAXSUPPLY * 4 / 100, // 4.00% of Total Amount
  TGEPercentage: 3.00 * 100, // 3% at TGE
  price: 0.0060 * 10000 // price in USDT.
}

function App() {
  const [currentAccount, setCurrentAccount] = useState()
  const [passedDate, setPassedDate] = useState(0);
  const [relesableAmount, setReleasableAmount] = useState(0);
  const [adminBalance, setAdminBalance] = useState(0);

  	// Calls Metamask to connect wallet on clicking Connect Wallet button
	const connectWallet = async () => {
		try {
			const { ethereum } = window

			if (!ethereum) {
				console.log('Metamask not detected')
				return
			}
			let chainId = await ethereum.request({ method: 'eth_chainId' })
			console.log('Connected to chain:' + chainId)

			const rinkebyChainId = '0x61'

			const devChainId = 1337
			const localhostChainId = `0x${Number(devChainId).toString(16)}`

			if (chainId !== rinkebyChainId && chainId !== localhostChainId) {
				alert('You are not connected to the Rinkeby Testnet!')
				return
			}

			const accounts = await ethereum.request({ method: 'eth_requestAccounts' })

			setCurrentAccount(accounts[0])
		} catch (error) {
			console.log('Error connecting to metamask', error)
		}
	}
  
  useEffect(()=>{

    const setTokenVesting = async () => {
      const { ethereum } = window
  
      const provider = new ethers.providers.Web3Provider(ethereum)
      const signer = provider.getSigner()
      tokenVesting = new ethers.Contract(
        addresses.VestingToken,
        vestingToken.abi,
        signer
      )
    }

    setTokenVesting();
  }, []);

  const changeTime = async () => {

    if (tokenVesting) {
      const { ethereum } = window
  
      const provider = new ethers.providers.Web3Provider(ethereum)
      const signer = provider.getSigner()
      
      const curTime = STARTTIME + passedDate * 86400;
      await tokenVesting.setCurrentTime(curTime);
      console.log("Settime success:");

      //Compute schedule ID
      const scheduleId = await tokenVesting.getVestingSchedulesCount();
      console.log("ScheduleID = ", scheduleId);

      //Compute vesting schedule id
      const vestingScheduleId = await tokenVesting.computeVestingScheduleIdForAddressAndIndex(vestingParams.beneficiary, 0);
      console.log("VestingScheduleID = ", vestingScheduleId); 
      
      const amount = await tokenVesting.connect(signer).computeReleasableAmount(vestingScheduleId);
      console.log(amount.toNumber());
    
    }
  }
  // calculate Releasable Amount
	const calculateReleasableAmount = async () => {
		try {
			const { ethereum } = window

			if (ethereum) {
        const { ethereum } = window
  
        const provider = new ethers.providers.Web3Provider(ethereum)
        const signer = provider.getSigner()
  
        //Compute schedule ID
        const scheduleId = await tokenVesting.getVestingSchedulesCount();
        console.log("ScheduleID = ", scheduleId);

        //Compute vesting schedule id
        const vestingScheduleId = await tokenVesting.computeVestingScheduleIdForAddressAndIndex(vestingParams.beneficiary, 0);
        console.log("VestingScheduleID = ", vestingScheduleId); 

        //Compute the Withdrawable Amount
        const withAmount = await tokenVesting.getWithdrawableAmount();
        console.log("withAmount = ", withAmount.toNumber());

        //Compute the amount of releasable amount
        const amount = await tokenVesting.connect(signer).computeReleasableAmount(vestingScheduleId)
        console.log(amount.toNumber());

        setReleasableAmount(amount.toNumber());

			} else {
				console.log("Ethereum object doesn't exist!")
			}
		} catch (error) {
			console.log('Error character', error);
			// setTxError(error.message)
		}
	}

  const calculateAdminBalance = async() => {
    const { ethereum } = window
  
    const provider = new ethers.providers.Web3Provider(ethereum)
    const signer = provider.getSigner()
    mockToken = new ethers.Contract(
      addresses.USDTToken,
      usdtToken.abi,
      signer
    )
    
    const tokenAmount = await mockToken.balanceOf(addresses.Beneficiary);
    console.log("admin bal:", ethers.utils.formatUnits(tokenAmount, 18));
    setAdminBalance(Number.parseInt(ethers.utils.formatUnits(tokenAmount, 18)));
  }

  const claim = async () => {
    const { ethereum } = window
  
    const provider = new ethers.providers.Web3Provider(ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = provider.getSigner();
    console.log("Account:", await signer.getAddress());
    
    const address = await signer.getAddress();
    console.log("signer address =>", address);
    
    mockToken = new ethers.Contract(
      addresses.USDTToken,
      usdtToken.abi,
      signer
    )


    const amountUsdt = BigNumber.from(1200000).mul(BigNumber.from(10).pow(18));
    await mockToken.approve(tokenVesting.address, amountUsdt.toString());

    await tokenVesting.connect(signer).claim();
  }


  return (
    <div className="App">
      <div className="action-bar">
        <button className="button" onClick={connectWallet}>Connect Wallet</button>
      </div>
      <div className="account-bar">
        <p className="account-addr">Connected Account Status : <span className="account-addr_content">{currentAccount ?? "Not Connected"}</span></p>
      </div>
      <p className="vesting-title">Seed Sale Round</p>
      <div className="vesting-param">
        {Object.keys(vestingParams).map((itemKey: string) => (
          <div key={itemKey} className="vesting-param-item">
            <div>{itemKey}</div>
            <div>{vestingParams[itemKey as IVestingParams ]}</div>
          </div>
        )
        )}
      </div>
      <div className="action-container">
        <div className="timer-bar">
          <div className="timer-bar_item">
            <p>Starting Date : </p>
            <p>{vestingParams.start}</p>
          </div>
          <div className="timer-bar_item">
            <p>Set Passed Day : </p>
            <div className="timer-container"><input value={passedDate} onChange={(e)=>setPassedDate(Number.parseInt(e.target.value as string))} type="number" className="timer-input" placeholder='input the passed day'/></div>
          </div>
          <div className="timer-bar_item">
            <button className='button' onClick={changeTime}>Set Time</button>
          </div>

        </div>
        <div className="address-bar">
          {Object.keys(addresses).map((item) => (
          <div key={item} className="address-bar_item">
            <p>{item}</p>
            <p className="address-bar_item__desc"><a href={"https://testnet.bscscan.com/address/" + addresses[item as IAddress]}>{addresses[item as IAddress]}</a></p>
          </div> 
          ))}
        </div>
      </div>
      <div className="balance-bar">
        <div><button className="button" onClick={calculateReleasableAmount}>Releasable Web23Token Amount</button><p>{relesableAmount}</p></div>
        <div><button className="button" onClick={calculateAdminBalance}>Admin Balance (USDT Token)</button><p>{adminBalance}</p></div>
      </div>
      <div className="claim-bar">
        <button className="button" onClick={claim}>C L A I M</button>
      </div>
    </div>
  );
}

export default App;
