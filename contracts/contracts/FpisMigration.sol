// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IVeFxs {
   function locked(address _account) external view returns(int128 amount, uint256 end);
   function deposit_for(address _account, uint256 _value) external;
}

interface IFpis{
    function addMinter(address minter_address) external;
    function minter_burn_from(address b_address, uint256 b_amount) external;
}

interface IMigrationCallback{
    function lockFor(address _target, uint256 _amount) external;
}

/*
Migration contract of FPIS to veFXS

Basic function:
- pull fpis from caller (or burn)
- check that target has a lock greater than minimum time limit
- lock Fxs (sitting in contract) for the target address using a conversion rate of fpis to fxs

Extras:
- whitelist processor contracts for specific target addresses
- transfer fxs to processor contract if it exists and let it do the locking logic

*/
contract FpisMigration is ReentrancyGuard{
    using SafeERC20 for IERC20;

    address public constant fpis = address(0xc2544A32872A91F4A553b404C6950e89De901fdb);
    address public constant fxs = address(0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0);
    address public constant vefxs = address(0xc8418aF6358FFddA74e09Ca9CC3Fe03Ca6aDC5b0);

    //timelock and owner of fpis
    address public constant timelock_address = address(0x8412ebf45bAC1B340BbE8F318b928C466c4E39CA);
    address public constant owner = address(0x6A7efa964Cf6D9Ab3BC3c47eBdDB853A8853C502);

    uint256 public constant minimum_lock = 365 days * 3;
    uint256 private constant WEEK = 7 * 86400;
    uint256 public immutable conversion_rate; //fpis to fxs, ie: 5e18 = 5 fpis for 1 vefxs

    mapping(address => address) public processors;

    event UserMigrated(address indexed _user, address _target, uint256 _amountFpis, uint256 _amountFxs);
    event ProcessorAdded(address indexed _target, address _processor);
    event MigratableTokenAdded(address indexed _target, uint256 _allowance);

    constructor(uint256 _rate) {
        conversion_rate = _rate;
    }

    modifier onlyByOwnGov() {
        require(msg.sender == timelock_address || msg.sender == owner, "Not owner or timelock");
        _;
    }

    // Adds whitelisted processors 
    function addProcessor(address _target, address _processor) public onlyByOwnGov {
        processors[_target] = _processor; 

        emit ProcessorAdded(_target,_processor);
    }

    //migrate fpis to veFxs
    function migrate(uint256 _amount, address _target) external nonReentrant{
        //1. require a current lock on the target that is greater than minimum length (rounded to epoch)
        (, uint256 end) = IVeFxs(vefxs).locked(_target);
        require(end >= (block.timestamp + minimum_lock) / WEEK * WEEK, "target needs longer lock");

        //2. burn fpis
        IFpis(fpis).minter_burn_from(msg.sender, _amount);

        //3. convert amount
        uint256 fxsAmount = _amount * 1e18 / conversion_rate;

        //4. lock for target directly or send to whitelisted module to process lock
        if(processors[_target] != address(0)){
            //send to processor
            IERC20(fxs).safeTransfer(processors[_target], fxsAmount);
            IMigrationCallback(processors[_target]).lockFor(msg.sender, fxsAmount);
        }else{
            //lock directly
            IERC20(fxs).safeTransfer(_target, fxsAmount);
            IVeFxs(vefxs).deposit_for(_target, fxsAmount);
        }

        emit UserMigrated(msg.sender, _target, _amount, fxsAmount);
    }
}