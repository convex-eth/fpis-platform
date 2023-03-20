// const { BN, constants, expectEvent, expectRevert, time } = require('openzeppelin-test-helpers');
const { BN, time } = require('openzeppelin-test-helpers');
var jsonfile = require('jsonfile');
var contractList = jsonfile.readFileSync('./contracts.json');

const IERC20 = artifacts.require("IERC20");
const IPoolFactory = artifacts.require("IPoolFactory");


// -- for new ganache
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

contract("Deploy contracts", async accounts => {
  it("should deploy contracts", async () => {

    let deployer = "0x947B7742C403f20e5FaCcDAc5E092C943E7D0277";
    let multisig = "0xa3C5A1e09150B75ff251c1a7815A07182c3de2FB";
    let addressZero = "0x0000000000000000000000000000000000000000"

    let factory = await IPoolFactory.at("0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571");

    var tokens = [
      "0xc2544A32872A91F4A553b404C6950e89De901fdb",
      "0xa2847348b58CEd0cA58d23c7e9106A49f1427Df6",
      addressZero,
      addressZero
      ];
    await factory.deploy_plain_pool("cvxFpis/Fpis","cvxFpis", tokens, 20, 15000000, 3, 4, 2597 );
    console.log("deployed");

    return;
  });
});


