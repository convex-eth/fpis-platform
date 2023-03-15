const { BN, constants, expectEvent, expectRevert, time } = require('openzeppelin-test-helpers');
var jsonfile = require('jsonfile');
var contractList = jsonfile.readFileSync('./contracts.json');

const FraxVoterProxy = artifacts.require("FraxVoterProxy");
const Booster = artifacts.require("Booster");
const FpisDepositor = artifacts.require("FpisDepositor");
const cvxFpisToken = artifacts.require("cvxFpisToken");
const cvxFpisStaking = artifacts.require("cvxFpisStaking");
const FeeDepositV2 = artifacts.require("FeeDepositV2");
const FeeReceiverCvxFpis = artifacts.require("FeeReceiverCvxFpis");
const ICvxDistribution = artifacts.require("ICvxDistribution");

const IDelegation = artifacts.require("IDelegation");
const IWalletChecker = artifacts.require("IWalletChecker");
const IFeeDistro = artifacts.require("IFeeDistro");
const IVoteEscrow = artifacts.require("IVoteEscrow");
const IERC20 = artifacts.require("IERC20");


const addAccount = async (address) => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_addAccount",
        params: [address, "passphrase"],
        id: new Date().getTime(),
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      }
    );
  });
};

const unlockAccount = async (address) => {
  await addAccount(address);
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "personal_unlockAccount",
        params: [address, "passphrase"],
        id: new Date().getTime(),
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      }
    );
  });
};

const send = payload => {
  if (!payload.jsonrpc) payload.jsonrpc = '2.0';
  if (!payload.id) payload.id = new Date().getTime();

  return new Promise((resolve, reject) => {
    web3.currentProvider.send(payload, (error, result) => {
      if (error) return reject(error);

      return resolve(result);
    });
  });
};

/**
 *  Mines a single block in Ganache (evm_mine is non-standard)
 */
const mineBlock = () => send({ method: 'evm_mine' });

/**
 *  Gets the time of the last block.
 */
const currentTime = async () => {
  const { timestamp } = await web3.eth.getBlock('latest');
  return timestamp;
};

/**
 *  Increases the time in the EVM.
 *  @param seconds Number of seconds to increase the time by
 */
const fastForward = async seconds => {
  // It's handy to be able to be able to pass big numbers in as we can just
  // query them from the contract, then send them back. If not changed to
  // a number, this causes much larger fast forwards than expected without error.
  if (BN.isBN(seconds)) seconds = seconds.toNumber();

  // And same with strings.
  if (typeof seconds === 'string') seconds = parseFloat(seconds);

  await send({
    method: 'evm_increaseTime',
    params: [seconds],
  });

  await mineBlock();
};

contract("FPIS Deposits", async accounts => {
  it("should successfully run", async () => {
    
    let deployer = contractList.system.deployer;
    let multisig = contractList.system.multisig;
    let addressZero = "0x0000000000000000000000000000000000000000"

    let cvx = await IERC20.at(contractList.system.cvx);
    let fpis = await IERC20.at(contractList.frax.fpis);
    let vefpis = await IERC20.at(contractList.frax.vefpis);
    let feeDistro = await IFeeDistro.at(contractList.frax.vefpisRewardDistro);
    let walletChecker = await IWalletChecker.at(contractList.frax.walletChecker);
    let checkerAdmin = await walletChecker.owner();
    

    let userA = accounts[0];
    let userB = accounts[1];
    let userC = accounts[2];
    let userD = accounts[3];
    let userZ = "0xAAc0aa431c237C2C0B5f041c8e59B3f1a43aC78F";
    var userNames = {};
    userNames[userA] = "A";
    userNames[userB] = "B";
    userNames[userC] = "C";
    userNames[userD] = "D";
    userNames[userZ] = "Z";

    const advanceTime = async (secondsElaspse) => {
      await time.increase(secondsElaspse);
      await time.advanceBlock();
      console.log("\n  >>>>  advance time " +(secondsElaspse/86400) +" days  >>>>\n");
    }
    const day = 86400;
    await unlockAccount(deployer);
    await unlockAccount(multisig);

    //deploy
    let voteproxy = await FraxVoterProxy.at(contractList.system.voteProxy);
    let cvxfpis = await cvxFpisToken.at(contractList.system.cvxFpis);
    let fpisdeposit = await FpisDepositor.at(contractList.system.fpisDepositor);
    let booster = await Booster.at(contractList.system.booster);
    let staking = await cvxFpisStaking.at(contractList.system.cvxFpisStaking);
    let feeQueue = await FeeDepositV2.at(contractList.system.vefpisRewardQueue);
    let stakingFeeReceiver = await FeeReceiverCvxFpis.at(contractList.system.cvxFpisStakingFeeReceiver);


    console.log("add to whitelist..");
    //add to whitelist
    let voteEscrow = await IVoteEscrow.at(vefpis.address);
    let escrowAdmin = await voteEscrow.admin();
    await unlockAccount(escrowAdmin);
    await unlockAccount(checkerAdmin);
    await voteEscrow.commit_smart_wallet_checker(walletChecker.address,{from:escrowAdmin,gasPrice:0});
    await voteEscrow.apply_smart_wallet_checker({from:escrowAdmin,gasPrice:0});
    await walletChecker.approveWallet(voteproxy.address,{from:checkerAdmin,gasPrice:0});
    console.log("approved wallet");
    let isWhitelist = await walletChecker.check(voteproxy.address);
    console.log("is whitelist? " +isWhitelist);


    console.log("\n >>> test lock >>>\n");
    //get fpis
    await unlockAccount(vefpis.address);
    await fpis.transfer(deployer,web3.utils.toWei("100000.0", "ether"),{from:vefpis.address,gasPrice:0})
    await fpis.transfer(userA,web3.utils.toWei("1000.0", "ether"),{from:vefpis.address,gasPrice:0})
    let startingfpis = await fpis.balanceOf(userA);
    console.log("fpis on userA: " +startingfpis);

    //lock fpis directly on proxy
    console.log("transfer some to vote proxy...")
    await fpis.transfer(voteproxy.address, web3.utils.toWei("1000.0", "ether"), {from:deployer});
    await fpis.balanceOf(voteproxy.address).then(a=>console.log("fpis on proxy: " +a));
    //initial lock
    await fpisdeposit.initialLock({from:deployer});
    console.log("init locked");
    await voteEscrow.locked__end(voteproxy.address).then(a=>console.log("lock end: " +a));
    await vefpis.balanceOf(voteproxy.address).then(a=>console.log("vefpis: " +a));


    //claim fees
    console.log("distribute fees...");
    await booster.claimFees(contractList.frax.vefpisRewardDistro, fpis.address);
    let cvxdistro = await ICvxDistribution.at(contractList.system.cvxDistro);
    await cvxdistro.setWeight(stakingFeeReceiver.address, 500, {from:deployer});

    console.log("claim once to checkpoint..");
    await advanceTime(day*5);
    await fpis.balanceOf(feeQueue.address).then(a=>console.log("fpis on fee queue: " +a));
    await fpis.balanceOf(contractList.system.treasury).then(a=>console.log("fpis on treasury: " +a));
    await fpis.balanceOf(staking.address).then(a=>console.log("fpis on staking: " +a));
    await fpis.balanceOf(stakingFeeReceiver.address).then(a=>console.log("fpis on stakingFeeReceiver: " +a));

    await booster.claimFees(contractList.frax.vefpisRewardDistro, fpis.address);
    console.log("claimed vefpis rewards -> process fpis/cvx")

    await fpis.balanceOf(feeQueue.address).then(a=>console.log("fpis on fee queue: " +a));
    await fpis.balanceOf(contractList.system.treasury).then(a=>console.log("fpis on treasury: " +a));
    await fpis.balanceOf(staking.address).then(a=>console.log("fpis on staking: " +a));
    await fpis.balanceOf(stakingFeeReceiver.address).then(a=>console.log("fpis on stakingFeeReceiver: " +a));

    //earn
    await staking.rewardData(fpis.address).then(a=>console.log("fpis reward data: " +JSON.stringify(a) ))
    await staking.rewardData(cvx.address).then(a=>console.log("cvx reward data: " +JSON.stringify(a) ))


    
  });
});


