// const { BN, constants, expectEvent, expectRevert, time } = require('openzeppelin-test-helpers');
const { BN, time } = require('openzeppelin-test-helpers');
var jsonfile = require('jsonfile');
var contractList = jsonfile.readFileSync('./contracts.json');

const Booster = artifacts.require("Booster");
const FpisDepositor = artifacts.require("FpisDepositor");
const FpisMigration = artifacts.require("FpisMigration");
const FpisMigrationConvexProcessor = artifacts.require("FpisMigrationConvexProcessor");
const IFpis = artifacts.require("IFpis");
const IVeFxs = artifacts.require("IVeFxs");
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
  let NETWORK = config.network;
  if(!NETWORK.includes("debug")){
    return null;
  }
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

contract("Test migration of fpis to vefxs", async accounts => {
  it("should complete migration", async () => {

    let deployer = "0x947B7742C403f20e5FaCcDAc5E092C943E7D0277";
    let multisig = "0xa3C5A1e09150B75ff251c1a7815A07182c3de2FB";
    let addressZero = "0x0000000000000000000000000000000000000000"
    let treasury = contractList.system.treasury;
    

    //system
    let cvx = await IERC20.at(contractList.system.cvx);
    let crv = await IERC20.at("0xD533a949740bb3306d119CC777fa900bA034cd52");
    let cvxCrv = await IERC20.at("0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7");
    let cvxfpis = await IERC20.at(contractList.system.cvxFpis);
    let cvxfxs = await IERC20.at("0xFEEf77d3f69374f66429C91d732A244f074bdf74");
    let fxs = await IERC20.at(contractList.frax.fxs);
    let fpis = await IERC20.at(contractList.frax.fpis);
    let vefpis = await IVoteEscrow.at(contractList.frax.vefpis);
    let vefxs = await IVoteEscrow.at(contractList.frax.vefxs);
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
      await fastForward(secondsElaspse);
      console.log("\n  >>>>  advance time " +(secondsElaspse/86400) +" days  >>>>\n");
    }
    const day = 86400;

    await unlockAccount(deployer);
    await unlockAccount(multisig);
    await unlockAccount(treasury);

    console.log(">>> unlock vefpis")
    var vefpisadmin = await vefpis.admin();
    await unlockAccount(vefpisadmin);
    await vefpis.toggleEmergencyUnlock({from:vefpisadmin,gasPrice:0});
    console.log("vefpis unlocked\n\n")

    
    console.log(">>> deploy migration contracts")
    let migration = await FpisMigration.new("5000000000000000000");
    console.log("migration contract at: " +migration.address);
    var migrationAdmin = await migration.owner();
    await unlockAccount(migrationAdmin);
    console.log("admin at: " +migrationAdmin);

    var fpismint = await IFpis.at(fpis.address);
    await fpismint.addMinter(migration.address,{from:migrationAdmin,gasPrice:0})
    console.log("added migration contracts as a fpis minter")

    let convexProcessor = await FpisMigrationConvexProcessor.new();
    console.log("convex processor at: " +convexProcessor.address);
    var convexfxs = "0x59CFCD384746ec3035299D90782Be065e466800B";
    await migration.addProcessor(convexfxs, convexProcessor.address,{from:deployer,gasPrice:0}).catch(a=>console.log("!role: " +a));
    await migration.addProcessor(convexfxs, convexProcessor.address,{from:migrationAdmin,gasPrice:0});
    console.log("added convex processor");
    console.log("deployment complete")


    console.log("\n\n>>> seed with fxs and obtain fpis")
    var fxsholder = "0x63278bF9AcdFC9fA65CFa2940b89A34ADfbCb4A1";
    var fpisholder = "0x9AA7Db8E488eE3ffCC9CdFD4f2EaECC8ABeDCB48";
    await unlockAccount(fxsholder);
    await unlockAccount(fpisholder);
    await fxs.transfer(migration.address,web3.utils.toWei("10000000.0", "ether"),{from:fxsholder,gasPrice:0})
    await fpis.transfer(deployer,web3.utils.toWei("10000.0", "ether"),{from:fpisholder,gasPrice:0})
    console.log("transfered")
    await fxs.balanceOf(migration.address).then(a=>console.log("balance of fxs on migration contract: " +a))
    await fpis.balanceOf(deployer).then(a=>console.log("balance of fpis on local wallet: " +a))


    console.log("\n\n>>> test direct migration")
    var fpisbalance = await fpis.balanceOf(deployer);
    console.log("fpis balance: " +fpisbalance);
    await fxs.approve(vefxs.address,web3.utils.toWei("100000000000.0", "ether"),{from:deployer});
    console.log("approval for fxs to vefxs")
    await fpis.approve(migration.address,web3.utils.toWei("100000000000.0", "ether"),{from:deployer});
    console.log("approval for fpis to migration")

    //try migrate, should fail on vefxs check since no lock
    console.log("try migrate but fail for because no lock...")
    await migration.migrate(fpisbalance, deployer,{from:deployer}).catch(a=>console.log("revert: " +a));

    console.log("lock vefxs...")
    await fxs.transfer(deployer,web3.utils.toWei("1.0", "ether"),{from:fxsholder,gasPrice:0})
    var unlocktime = ((new Date().getTime() / 1000) + (2 * 365 * 86400)).toFixed(0);
    console.log("unlock time (2 yrs): " +unlocktime);
    await vefxs.create_lock(web3.utils.toWei("1.0", "ether"), unlocktime, {from:deployer});
    console.log("lock created")
    var vefxslocked = await IVeFxs.at(vefxs.address);
    var lockinfo = await vefxslocked.locked(deployer);
    console.log("amount locked: " +lockinfo.amount)
    console.log("end time: " +lockinfo.end)

    //try migrate, should fail on vefxs check due to lock length
    console.log("try migrate but fail because too short")
    await migration.migrate(fpisbalance, deployer,{from:deployer}).catch(a=>console.log("revert: " +a));


    console.log("increase lock...");
    var unlocktime = ((new Date().getTime() / 1000) + (3 * 365 * 86400) + (8 * 86400) ).toFixed(0);
    console.log("unlock time (3 yrs+1 week): " +unlocktime);
    await vefxs.increase_unlock_time(unlocktime,{from:deployer});
    console.log("unlock time increased.")
    var lockinfo = await vefxslocked.locked(deployer);
    console.log("amount locked: " +lockinfo.amount)
    console.log("end time: " +lockinfo.end)


    console.log("try migrate again")
    var tx = await migration.migrate(fpisbalance, deployer,{from:deployer});
    console.log("migrated, gas: " +tx.receipt.gasUsed);


    var lockinfo = await vefxslocked.locked(deployer);
    console.log("amount locked: " +lockinfo.amount)
    console.log("end time: " +lockinfo.end)
    await fpis.balanceOf(deployer).then(a=>console.log("balance of fpis: " +a))


    console.log("\n\n>>> test processed migration")
    var voteproxy = contractList.system.voteProxy;
    await migration.processors(convexfxs).then(a=>console.log("processor for convex: " +a))
    await unlockAccount(voteproxy);
    console.log("withdraw from vefpis")
    await fpis.balanceOf(voteproxy).then(a=>console.log("fpis before withdraw: " +a))
    await vefpis.withdraw({from:voteproxy,gasPrice:0});
    var fpisbalance = await fpis.balanceOf(voteproxy);
    console.log("fpis after withdraw: " +fpisbalance);
    // await fxs.approve(vefxs.address,web3.utils.toWei("100000000000.0", "ether"),{from:voteproxy,gasPrice:0});
    // console.log("approval for fxs")
    await fpis.approve(migration.address,web3.utils.toWei("100000000000.0", "ether"),{from:voteproxy,gasPrice:0});
    console.log("approval for fpis to migration")
    console.log("migrate to cvxfxs")
    await cvxfxs.balanceOf(voteproxy).then(a=>console.log("cvxfxs balance before: " +a))
    await vefxs.locked(convexfxs).then(a=>console.log("convexfxs locked before: "+a))
    await fxs.balanceOf("0x8f55d7c21bDFf1A51AFAa60f3De7590222A3181e").then(a=>console.log("fxs on cvxfxs depositor: "+a))

    var tx = await migration.migrate(fpisbalance, convexfxs,{from:voteproxy,gasPrice:0})//.catch(a=>console.log("revert: " +a));
    console.log("migrated, gas: " +tx.receipt.gasUsed);

    await fpis.balanceOf(voteproxy).then(a=>console.log("fpis after migration: " +a))
    await cvxfxs.balanceOf(voteproxy).then(a=>console.log("cvxfxs balance after: " +a))
    await vefxs.locked(convexfxs).then(a=>console.log("convexfxs locked after: "+a))
    await fxs.balanceOf("0x8f55d7c21bDFf1A51AFAa60f3De7590222A3181e").then(a=>console.log("fxs on cvxfxs depositor: "+a))
  });
});


