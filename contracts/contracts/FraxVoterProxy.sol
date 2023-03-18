// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./interfaces/IFeeDistro.sol";
import "./interfaces/IDeposit.sol";
import "./interfaces/IVoteEscrow.sol";
import "./interfaces/ITokenMinter.sol";
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';


contract FraxVoterProxy {
    using SafeERC20 for IERC20;

    address public constant fpis = address(0xc2544A32872A91F4A553b404C6950e89De901fdb);
    address public constant escrow = address(0x574C154C83432B0A45BA3ad2429C3fA242eD7359);
    
    address public owner;
    address public pendingOwner;
    address public operator;
    address public depositor;
    
    event SetPendingOwner(address indexed _address);
    event OwnerChanged(address indexed _address);
    
    constructor(){
        owner = msg.sender;
    }

    function getName() external pure returns (string memory) {
        return "FraxFpisVoterProxy";
    }

    //set next owner
    function setPendingOwner(address _po) external {
        require(msg.sender == owner, "!auth");
        pendingOwner = _po;
        emit SetPendingOwner(_po);
    }

    //claim ownership
    function acceptPendingOwner() external {
        require(msg.sender == pendingOwner, "!p_owner");

        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnerChanged(owner);
    }

    function setOperator(address _operator) external {
        require(msg.sender == owner, "!auth");
        require(operator == address(0) || IDeposit(operator).isShutdown() == true, "needs shutdown");
        
        //require isshutdown interface
        require(IDeposit(_operator).isShutdown() == false, "no shutdown interface");
        
        operator = _operator;
    }

    function setDepositor(address _depositor) external {
        require(msg.sender == owner, "!auth");

        depositor = _depositor;
    }

    function createLock(uint256 _value, uint256 _unlockTime) external returns(bool){
        require(msg.sender == depositor, "!auth");
        IERC20(fpis).safeApprove(escrow, 0);
        IERC20(fpis).safeApprove(escrow, _value);
        IVoteEscrow(escrow).create_lock(_value, _unlockTime);
        return true;
    }

    function increaseAmount(uint256 _value) external returns(bool){
        require(msg.sender == depositor, "!auth");
        IERC20(fpis).safeApprove(escrow, 0);
        IERC20(fpis).safeApprove(escrow, _value);
        IVoteEscrow(escrow).increase_amount(_value);
        return true;
    }

    function increaseTime(uint256 _value) external returns(bool){
        require(msg.sender == depositor, "!auth");
        IVoteEscrow(escrow).increase_unlock_time(_value);
        return true;
    }

    function release() external returns(bool){
        require(msg.sender == depositor, "!auth");
        IVoteEscrow(escrow).withdraw();
        return true;
    }

    function checkpointFeeRewards(address _distroContract) external{
        require(msg.sender == depositor || msg.sender == operator, "!auth");
        IFeeDistro(_distroContract).checkpoint();
    }

    function claimFees(address _distroContract, address _token, address _claimTo) external returns (uint256){
        require(msg.sender == operator, "!auth");
        uint256 _balance = IERC20(_token).balanceOf(address(this));
        IFeeDistro(_distroContract).getYield();
        IERC20(_token).safeTransfer(_claimTo, IERC20(_token).balanceOf(address(this)) - _balance);
        return _balance;
    }    

    function execute(
        address _to,
        uint256 _value,
        bytes calldata _data
    ) external returns (bool, bytes memory) {
        require(msg.sender == operator,"!auth");

        (bool success, bytes memory result) = _to.call{value:_value}(_data);

        return (success, result);
    }

}