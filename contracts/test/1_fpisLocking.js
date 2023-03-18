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
    let burner = await Burner.at(contractList.system.burner);

    let voteEscrow = await IVoteEscrow.at(vefpis.address);
    let escrowAdmin = await voteEscrow.admin();

    //test ownership transfers
    await voteproxy.owner().then(a=>console.log("voteproxy.owner: " +a))
    await voteproxy.pendingOwner().then(a=>console.log("voteproxy.pendingOwner: " +a))
    await voteproxy.setPendingOwner(multisig,{from:userA}).catch(a=>console.log("revert auth: " +a));
    await voteproxy.setPendingOwner(multisig,{from:deployer});
    await voteproxy.pendingOwner().then(a=>console.log("voteproxy.pendingOwner: " +a))
    await voteproxy.acceptPendingOwner({from:userA}).catch(a=>console.log("revert auth: " +a));
    await voteproxy.acceptPendingOwner({from:multisig,gasPrice:0})
    await voteproxy.owner().then(a=>console.log("voteproxy.owner: " +a))
    await voteproxy.pendingOwner().then(a=>console.log("voteproxy.pendingOwner: " +a))


    await booster.owner().then(a=>console.log("booster.owner: " +a))
    await booster.pendingOwner().then(a=>console.log("booster.pendingOwner: " +a))
    await booster.setPendingOwner(multisig,{from:userA}).catch(a=>console.log("revert auth: " +a));
    await booster.setPendingOwner(multisig,{from:deployer});
    await booster.pendingOwner().then(a=>console.log("booster.pendingOwner: " +a))
    await booster.acceptPendingOwner({from:userA}).catch(a=>console.log("revert auth: " +a));
    await booster.acceptPendingOwner({from:multisig,gasPrice:0})
    await booster.owner().then(a=>console.log("booster.owner: " +a))
    await booster.pendingOwner().then(a=>console.log("booster.pendingOwner: " +a))


    await fpisdeposit.owner().then(a=>console.log("fpisdeposit.owner: " +a))
    await fpisdeposit.pendingOwner().then(a=>console.log("fpisdeposit.pendingOwner: " +a))
    await fpisdeposit.setPendingOwner(multisig,{from:userA}).catch(a=>console.log("revert auth: " +a));
    await fpisdeposit.setPendingOwner(multisig,{from:deployer});
    await fpisdeposit.pendingOwner().then(a=>console.log("fpisdeposit.pendingOwner: " +a))
    await fpisdeposit.acceptPendingOwner({from:userA}).catch(a=>console.log("revert auth: " +a));
    await fpisdeposit.acceptPendingOwner({from:multisig,gasPrice:0})
    await fpisdeposit.owner().then(a=>console.log("fpisdeposit.owner: " +a))
    await fpisdeposit.pendingOwner().then(a=>console.log("fpisdeposit.pendingOwner: " +a))

    
    //test operator switch
    let boosterB = await Booster.new(voteproxy.address, fpisdeposit.address, cvxfpis.address, {from:deployer});
    await voteproxy.setOperator(boosterB.address,{from:multisig,gasPrice:0}).catch(a=>console.log("not shutdown: " +a))
    await booster.shutdownSystem({from:multisig,gasPrice:0});
    console.log("booster shutdown");
    await voteproxy.setOperator(deployer,{from:multisig,gasPrice:0}).catch(a=>console.log("invalid booster: " +a))
    await voteproxy.setOperator(boosterB.address,{from:userA}).catch(a=>console.log("not owner: " +a))
    await voteproxy.setOperator(boosterB.address,{from:multisig,gasPrice:0});
    booster = boosterB;
    await booster.setFeeQueue(feeQueue.address, true, {from:deployer});
    console.log("switched to new operator/booster");


    console.log("add to whitelist..");
    //add to whitelist
    await unlockAccount(escrowAdmin);
    await unlockAccount(checkerAdmin);
    await voteEscrow.commit_smart_wallet_checker(walletChecker.address,{from:escrowAdmin,gasPrice:0});
    await voteEscrow.apply_smart_wallet_checker({from:escrowAdmin,gasPrice:0});
    await walletChecker.approveWallet(voteproxy.address,{from:checkerAdmin,gasPrice:0});
    console.log("approved wallet");
    let isWhitelist = await walletChecker.check(voteproxy.address);
    console.log("is whitelist? " +isWhitelist);


    console.log("set snapshot delegation...");
    //set delegation
    let delegation = await IDelegation.at("0x469788fE6E9E9681C6ebF3bF78e7Fd26Fc015446");
    var spaceHex = "0x"+Buffer.from('fpis.eth', 'utf8').toString('hex');
    console.log("space(hex): " +spaceHex);
    await booster.setDelegate(delegation.address, deployer, spaceHex, {from:deployer});
    await delegation.delegation(voteproxy.address,spaceHex).then(a=>console.log("delegated to: " +a));

    let starttime = await time.latest();
    console.log("current block time: " +starttime)
    await time.latestBlock().then(a=>console.log("current block: " +a));


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
    await fpisdeposit.initialLock({from:multisig,gasPrice:0});
    console.log("init locked");
    await voteEscrow.locked__end(voteproxy.address).then(a=>console.log("lock end: " +a));
    await vefpis.balanceOf(voteproxy.address).then(a=>console.log("vefpis: " +a));
    await voteEscrow.locked(voteproxy.address).then(a=>console.log("locked fpis: " +a));

    //test withholdings
    await fpis.transfer(userC,web3.utils.toWei("2.0", "ether"),{from:vefpis.address,gasPrice:0})
    await fpisdeposit.setPlatformHoldings(2000,userD,{from:userA}).catch(a=>console.log("revert not deposit owner: " +a));
    await fpisdeposit.setPlatformHoldings(2000,userD,{from:multisig,gasPrice:0});
    console.log("set withholdings to 20");
    await fpis.balanceOf(userC).then(a=>console.log("fpis on C: " +a))
    await cvxfpis.balanceOf(userC).then(a=>console.log("cvxfpis on C: " +a))
    await fpis.balanceOf(userD).then(a=>console.log("fpis on D: " +a))
    await fpis.balanceOf(fpisdeposit.address).then(a=>console.log("fpis on depositor: " +a))
    await fpis.approve(fpisdeposit.address,web3.utils.toWei("100000.0", "ether"),{from:userC});
    await fpisdeposit.deposit(web3.utils.toWei("1.0", "ether"),false,{from:userC});
    await fpis.balanceOf(userC).then(a=>console.log("fpis on C: " +a))
    await cvxfpis.balanceOf(userC).then(a=>console.log("cvxfpis on C: " +a))
    await fpis.balanceOf(userD).then(a=>console.log("fpis on D: " +a))
    await fpis.balanceOf(fpisdeposit.address).then(a=>console.log("fpis on depositor: " +a))
    await fpisdeposit.deposit(web3.utils.toWei("1.0", "ether"),false,{from:userC});
    await fpis.balanceOf(userC).then(a=>console.log("fpis on C: " +a))
    await cvxfpis.balanceOf(userC).then(a=>console.log("cvxfpis on C: " +a))
    await fpis.balanceOf(userD).then(a=>console.log("fpis on D: " +a))
    await fpis.balanceOf(fpisdeposit.address).then(a=>console.log("fpis on depositor: " +a))

    await fpisdeposit.setPlatformHoldings(100,addressZero,{from:multisig,gasPrice:0}).catch(a=>console.log("revert, no address zero when positive: " +a));
    await fpisdeposit.setPlatformHoldings(0,addressZero,{from:multisig,gasPrice:0});
    console.log("holdings check done")

    //lock through depositor
    await fpis.approve(fpisdeposit.address,web3.utils.toWei("100000.0", "ether"),{from:userA});
    await fpisdeposit.deposit(web3.utils.toWei("100.0", "ether"),false,{from:userA});
    console.log("deposited no lock");
    await voteEscrow.locked__end(voteproxy.address).then(a=>console.log("lock end: " +a));
    await vefpis.balanceOf(voteproxy.address).then(a=>console.log("vefpis: " +a));
    await fpis.balanceOf(fpisdeposit.address).then(a=>console.log("fpis on deposit: " +a));
    await cvxfpis.balanceOf(userA).then(a=>console.log("cvxfpis on userA: " +a));
    await fpisdeposit.deposit(web3.utils.toWei("100.0", "ether"),true,{from:userA});
    console.log("deposited with lock");
    await voteEscrow.locked__end(voteproxy.address).then(a=>console.log("lock end: " +a));
    await vefpis.balanceOf(voteproxy.address).then(a=>console.log("vefpis: " +a));
    await fpis.balanceOf(fpisdeposit.address).then(a=>console.log("fpis on deposit: " +a));
    await cvxfpis.balanceOf(userA).then(a=>console.log("cvxfpis on userA: " +a));


    //stake
    await cvxfpis.approve(staking.address,web3.utils.toWei("100000.0", "ether"),{from:userA});
    await staking.stakeAll({from:userA});
    console.log("staked");
    await staking.balanceOf(userA).then(a=>console.log("staked balance: " +a))

    //claim fees
    console.log("distribute fees...");
    await booster.claimFees(contractList.frax.vefpisRewardDistro, fpis.address);
    let cvxdistro = await ICvxDistribution.at(contractList.system.cvxDistro);
    await cvxdistro.setWeight(stakingFeeReceiver.address, 500, {from:deployer});
    console.log("claim once to checkpoint..");
    await advanceTime(day);
    await fpis.balanceOf(feeQueue.address).then(a=>console.log("fpis on fee queue: " +a));
    await fpis.balanceOf(contractList.system.treasury).then(a=>console.log("fpis on treasury: " +a));
    await fpis.balanceOf(staking.address).then(a=>console.log("fpis on staking: " +a));
    await fpis.balanceOf(voteproxy.address).then(a=>console.log("fpis on voteproxy: " +a));
    await booster.claimFees(contractList.frax.vefpisRewardDistro, fpis.address);
    console.log("claimed vefpis rewards")
    await fpis.balanceOf(feeQueue.address).then(a=>console.log("fpis on fee queue: " +a));
    await fpis.balanceOf(contractList.system.treasury).then(a=>console.log("fpis on treasury: " +a));
    await fpis.balanceOf(staking.address).then(a=>console.log("fpis on staking: " +a));
    await fpis.balanceOf(voteproxy.address).then(a=>console.log("fpis on voteproxy: " +a));

    //earn
    await staking.claimableRewards(userA).then(a=>console.log("claimable: " +a))
    await advanceTime(day);
    await staking.claimableRewards(userA).then(a=>console.log("claimable: " +a))

    //test rescue
    await cvx.transfer(booster.address,web3.utils.toWei("1.0", "ether"),{from:deployer})
    await cvx.transfer(voteproxy.address,web3.utils.toWei("1.0", "ether"),{from:deployer})
    await cvx.balanceOf(booster.address).then(a=>console.log("cvx on booster: " +a))
    await cvx.balanceOf(voteproxy.address).then(a=>console.log("cvx on voteproxy: " +a))
    await booster.recoverERC20(cvx.address,web3.utils.toWei("1.0", "ether"), userD, {from:userA}).catch(a=>console.log("revert owner: " +a))
    await booster.recoverERC20(cvx.address,web3.utils.toWei("1.0", "ether"), userD, {from:deployer})
    await booster.recoverERC20FromProxy(cvx.address,web3.utils.toWei("1.0", "ether"), userD, {from:userA}).catch(a=>console.log("revert owner: " +a))
    await booster.recoverERC20FromProxy(cvx.address,web3.utils.toWei("1.0", "ether"), userD, {from:deployer})
    await cvx.balanceOf(userD).then(a=>console.log("cvx rescued to D: " +a))

    //test burn
    await fpisdeposit.deposit(web3.utils.toWei("100.0", "ether"),false,{from:userA});
    await cvxfpis.totalSupply().then(a=>console.log("total supply: " +a))
    await cvxfpis.balanceOf(userA).then(a=>console.log("balance on A: "+a))
    await cvxfpis.transfer(burner.address, web3.utils.toWei("50.0", "ether"))
    console.log("transfer to burner");
    await cvxfpis.balanceOf(userA).then(a=>console.log("balance on A: "+a))
    await cvxfpis.balanceOf(burner.address).then(a=>console.log("balance on burner: "+a))
    await burner.burn();
    await cvxfpis.totalSupply().then(a=>console.log("burned on burner, new total supply: " +a))
    await cvxfpis.balanceOf(userA).then(a=>console.log("balance on A: "+a))
    await cvxfpis.balanceOf(burner.address).then(a=>console.log("balance on burner: "+a))
    await burner.burnAtSender(web3.utils.toWei("50.0", "ether"),{from:userB}).catch(a=>console.log("revert not enough balance: " +a));
    await burner.burnAtSender(web3.utils.toWei("50.0", "ether"),{from:userA});
    await cvxfpis.totalSupply().then(a=>console.log("burned on sender(a), new total supply: " +a))
    await cvxfpis.balanceOf(userA).then(a=>console.log("balance on A: "+a))
    await cvxfpis.balanceOf(burner.address).then(a=>console.log("balance on burner: "+a))


    //check relock/time increase

    //let vefxs decay a bit
    await voteEscrow.locked__end(voteproxy.address).then(a=>console.log("lock end: " +a));
    await advanceTime(day*14);
    await vefpis.balanceOf(voteproxy.address).then(a=>console.log("vefpis: " +a));
    await voteEscrow.locked__end(voteproxy.address).then(a=>console.log("lock end: " +a));
    await fpis.approve(fpisdeposit.address,web3.utils.toWei("100000.0", "ether"),{from:deployer});

    for(var i = 0; i < 22; i++){
      await fpisdeposit.deposit(1000,true,{from:deployer});
      console.log("re deposited");
      await vefpis.balanceOf(voteproxy.address).then(a=>console.log("vefpis: " +a));
      await voteEscrow.locked__end(voteproxy.address).then(a=>console.log("lock end: " +a));
      await advanceTime(day);
    }

    //wait 4 years and unlock/relock
    for(var i = 0; i < 18; i++){
      await advanceTime(day*100);
      await vefpis.balanceOf(voteproxy.address).then(a=>console.log("vefpis: " +a));
      await voteEscrow.checkpoint();
    }


    await vefpis.balanceOf(voteproxy.address).then(a=>console.log("vefpis: " +a));
    await voteEscrow.locked(voteproxy.address).then(a=>console.log("fpis locked: " +a));

    //try to release and relock
    await fpisdeposit.initialLock({from:deployer});
    console.log("init locked again");
    await vefpis.balanceOf(voteproxy.address).then(a=>console.log("vefpis: " +a));
    await voteEscrow.locked__end(voteproxy.address).then(a=>console.log("lock end: " +a));

    
  });
});


