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
const Burner = artifacts.require("Burner");

const IDelegation = artifacts.require("IDelegation");
const IWalletChecker = artifacts.require("IWalletChecker");
const IFeeDistro = artifacts.require("IFeeDistro");
const IVoteEscrow = artifacts.require("IVoteEscrow");
const IERC20 = artifacts.require("IERC20");
const ICvxDistribution = artifacts.require("ICvxDistribution");


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

    // const advanceTime = async (secondsElaspse) => {
    //   await time.increase(secondsElaspse);
    //   await time.advanceBlock();
    //   console.log("\n  >>>>  advance time " +(secondsElaspse/86400) +" days  >>>>\n");
    // }
    // const day = 86400;
    // await unlockAccount(deployer);
    // await unlockAccount(multisig);

    //deploy
    let voteproxy = await FraxVoterProxy.at(contractList.system.voteProxy);
    let cvxfpis = await cvxFpisToken.at(contractList.system.cvxFpis);
    let fpisdeposit = await FpisDepositor.at(contractList.system.fpisDepositor);
    let booster = await Booster.at(contractList.system.booster);
    let staking = await cvxFpisStaking.at(contractList.system.cvxFpisStaking);
    let feeQueue = await FeeDepositV2.at(contractList.system.vefpisRewardQueue);
    let stakingFeeReceiver = await FeeReceiverCvxFpis.at(contractList.system.cvxFpisStakingFeeReceiver);
    let burner = await Burner.at(contractList.system.burner);

    let voteEscrow = await IVoteEscrow.at(vefpis.address);
    // let escrowAdmin = await voteEscrow.admin();


    // let feeQueue = await FeeDepositV2.new(voteproxy.address, cvxfpis.address, stakingFeeReceiver.address, {from:deployer});
    // console.log("feeQueue at: " +feeQueue.address);

    // await feeQueue.setPlatformIncentive(2000,{from:deployer});
    // console.log("set platform incentive");

    // await booster.setFeeQueue(feeQueue.address, true, {from:deployer});
    // console.log("fee queue set to booster")

    await fpis.balanceOf(staking.address).then(a=>console.log("fpis on staking: " +a))
    await cvx.balanceOf(staking.address).then(a=>console.log("cvx on staking: " +a))
    await booster.claimFees(contractList.frax.vefpisRewardDistro, fpis.address);
    console.log("fees claimed");

    await fpis.balanceOf(staking.address).then(a=>console.log("fpis on staking: " +a))
    await cvx.balanceOf(staking.address).then(a=>console.log("cvx on staking: " +a))
    return;

    // console.log("add to whitelist..");
    // //add to whitelist
    // await unlockAccount(escrowAdmin);
    // await unlockAccount(checkerAdmin);
    // await voteEscrow.commit_smart_wallet_checker(walletChecker.address,{from:escrowAdmin,gasPrice:0});
    // await voteEscrow.apply_smart_wallet_checker({from:escrowAdmin,gasPrice:0});
    // await walletChecker.approveWallet(voteproxy.address,{from:checkerAdmin,gasPrice:0});
    // console.log("approved wallet");
    let isWhitelist = await walletChecker.check(voteproxy.address);
    console.log("is whitelist? " +isWhitelist);


    console.log("set snapshot delegation...");
    //set delegation
    let delegation = await IDelegation.at("0x469788fE6E9E9681C6ebF3bF78e7Fd26Fc015446");
    var spaceHex = "0x"+Buffer.from('fpis.eth', 'utf8').toString('hex');
    console.log("space(hex): " +spaceHex);
    await booster.setDelegate(delegation.address, deployer, spaceHex, {from:deployer});
    await delegation.delegation(voteproxy.address,spaceHex).then(a=>console.log("delegated to: " +a));

    // let starttime = await time.latest();
    // console.log("current block time: " +starttime)
    // await time.latestBlock().then(a=>console.log("current block: " +a));


    // console.log("\n >>> test lock >>>\n");
    //get fpis
    // await unlockAccount(vefpis.address);
    // await fpis.transfer(deployer,web3.utils.toWei("100000.0", "ether"),{from:vefpis.address,gasPrice:0})
    // await fpis.transfer(userA,web3.utils.toWei("1000.0", "ether"),{from:vefpis.address,gasPrice:0})
    // let startingfpis = await fpis.balanceOf(userA);
    // console.log("fpis on userA: " +startingfpis);

    //lock fpis directly on proxy
    console.log("transfer some to vote proxy...")
    var initbal = await fpis.balanceOf(deployer);
    await fpis.transfer(voteproxy.address, initbal, {from:deployer});
    await fpis.balanceOf(voteproxy.address).then(a=>console.log("fpis on proxy: " +a));
    //initial lock
    await fpisdeposit.initialLock({from:deployer});
    console.log("init locked");
    await voteEscrow.locked__end(voteproxy.address).then(a=>console.log("lock end: " +a));
    await vefpis.balanceOf(voteproxy.address).then(a=>console.log("vefpis: " +a));
    await voteEscrow.locked(voteproxy.address).then(a=>console.log("locked fpis: " +a));

    await booster.claimFees(contractList.frax.vefpisRewardDistro, fpis.address);
    console.log("fees claimed");
    
  });
});


