// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./interfaces/IStaker.sol";
import "./interfaces/ITokenMinter.sol";
import "./interfaces/IVoteEscrow.sol";
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';


contract FpisDepositor{
    using SafeERC20 for IERC20;

    address public constant fpis = address(0xc2544A32872A91F4A553b404C6950e89De901fdb);
    address public constant escrow = address(0x574C154C83432B0A45BA3ad2429C3fA242eD7359);
    uint256 private constant MAXTIME = 4 * 364 * 86400;
    uint256 private constant WEEK = 7 * 86400;

    uint256 public lockIncentive = 0; //incentive to users who spend gas to lock
    uint256 public constant FEE_DENOMINATOR = 10000;

    address public feeManager;
    address public immutable staker;
    address public immutable minter;
    uint256 public incentiveFpis = 0;
    uint256 public unlockTime;

    constructor(address _staker, address _minter){
        staker = _staker;
        minter = _minter;
        feeManager = msg.sender;
    }

    function setFeeManager(address _feeManager) external {
        require(msg.sender == feeManager, "!auth");
        feeManager = _feeManager;
    }

    function setFees(uint256 _lockIncentive) external{
        require(msg.sender==feeManager, "!auth");

        if(_lockIncentive >= 0 && _lockIncentive <= 30){
            lockIncentive = _lockIncentive;
       }
    }

    function initialLock() external{
        require(msg.sender==feeManager, "!auth");

        uint256 vefpis = IERC20(escrow).balanceOf(staker);
        uint256 locked = IVoteEscrow(escrow).locked(staker);
        if(vefpis == 0 || vefpis == locked){
            uint256 unlockAt = block.timestamp + MAXTIME;
            uint256 unlockInWeeks = (unlockAt/WEEK)*WEEK;

            //release old lock if exists
            IStaker(staker).release();
            //create new lock
            uint256 fpisBalanceStaker = IERC20(fpis).balanceOf(staker);
            IStaker(staker).createLock(fpisBalanceStaker, unlockAt);
            unlockTime = unlockInWeeks;
        }
    }

    //lock fpis
    function _lockFpis() internal {
        uint256 fpisBalance = IERC20(fpis).balanceOf(address(this));
        if(fpisBalance > 0){
            IERC20(fpis).safeTransfer(staker, fpisBalance);
        }
        
        //increase ammount
        uint256 fpisBalanceStaker = IERC20(fpis).balanceOf(staker);
        if(fpisBalanceStaker == 0){
            return;
        }
        
        //increase amount
        IStaker(staker).increaseAmount(fpisBalanceStaker);
        

        uint256 unlockAt = block.timestamp + MAXTIME;
        uint256 unlockInWeeks = (unlockAt/WEEK)*WEEK;

        //increase time too if over 1 week buffer
        if( unlockInWeeks - unlockTime >= 1){
            IStaker(staker).increaseTime(unlockAt);
            unlockTime = unlockInWeeks;
        }
    }

    function lockFpis() external {
        _lockFpis();

        //mint incentives
        if(incentiveFpis > 0){
            ITokenMinter(minter).mint(msg.sender,incentiveFpis);
            incentiveFpis = 0;
        }
    }

    //deposit fpis for cvxFpis
    //can locking immediately or defer locking to someone else by paying a fee.
    function deposit(uint256 _amount, bool _lock) public {
        require(_amount > 0,"!>0");
        
        if(_lock){
            //lock immediately, transfer directly to staker to skip an erc20 transfer
            IERC20(fpis).safeTransferFrom(msg.sender, staker, _amount);
            _lockFpis();
            if(incentiveFpis > 0){
                //add the incentive tokens here so they can be staked together
                _amount = _amount + incentiveFpis;
                incentiveFpis = 0;
            }
        }else{
            //move tokens here
            IERC20(fpis).safeTransferFrom(msg.sender, address(this), _amount);
            //defer lock cost to another user
            if(lockIncentive > 0){
                uint256 callIncentive = _amount * lockIncentive / FEE_DENOMINATOR;
                _amount = _amount - callIncentive;

                //add to a pool for lock caller
                incentiveFpis = incentiveFpis + callIncentive;
            }
        }

        //mint for msg.sender
        ITokenMinter(minter).mint(msg.sender,_amount);
    }

    function depositAll(bool _lock) external{
        uint256 fpisBal = IERC20(fpis).balanceOf(msg.sender);
        deposit(fpisBal,_lock);
    }
}