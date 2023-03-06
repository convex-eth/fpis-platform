// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;


import "./interfaces/IStaker.sol";
import "./interfaces/IFeeReceiver.sol";
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';


/*
Main interface for the whitelisted proxy contract.

**This contract is meant to be able to be replaced for upgrade purposes. use IVoterProxy.operator() to always reference the current booster

*/
contract Booster{
    using SafeERC20 for IERC20;

    address public constant fpis = address(0xc2544A32872A91F4A553b404C6950e89De901fdb);

    address public immutable proxy;
    address public immutable fpisDepositor;
    address public immutable cvxfpis;
    address public owner;
    address public pendingOwner;

    address public feeclaimer;
    bool public isShutdown;
    address public feeQueue;
    bool public feeQueueProcess;

    mapping(address=>mapping(address=>bool)) public feeClaimMap;


    constructor(address _proxy, address _depositor, address _cvxfpis) {
        proxy = _proxy;
        fpisDepositor = _depositor;
        cvxfpis = _cvxfpis;
        isShutdown = false;
        owner = msg.sender;
        
        //TODO: consider moving to a module so dont have to set everything again if upgraded
        feeclaimer = address(0);
        feeClaimMap[address(0xc6764e58b36e26b08Fd1d2AeD4538c02171fA872)][fpis] = true;
        emit FeeClaimPairSet(address(0xc6764e58b36e26b08Fd1d2AeD4538c02171fA872), fpis, true);
     }

    /////// Owner Section /////////

    modifier onlyOwner() {
        require(owner == msg.sender, "!auth");
        _;
    }

    //set pending owner
    function setPendingOwner(address _po) external onlyOwner{
        pendingOwner = _po;
        emit SetPendingOwner(_po);
    }

    //claim ownership
    function acceptPendingOwner() external {
        require(pendingOwner != address(0) && msg.sender == pendingOwner, "!p_owner");

        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnerChanged(owner);
    }

    //make execute() calls to the proxy voter
    function _proxyCall(address _to, bytes memory _data) internal{
        (bool success,) = IStaker(proxy).execute(_to,uint256(0),_data);
        require(success, "Proxy Call Fail");
    }

    //set depositor as an operator of cvxfpis
    function setDepositorAsOperator() external onlyOwner{
        IStaker(proxy).setMinterOperator(cvxfpis, fpisDepositor, true);
    }

    //set fee queue, a contract fees are moved to when claiming
    function setFeeQueue(address _queue, bool _process) external onlyOwner{
        feeQueue = _queue;
        feeQueueProcess = _process;
        emit FeeQueueChanged(_queue, _process);
    }

    //set who can call claim fees, 0x0 address will allow anyone to call
    function setFeeClaimer(address _claimer) external onlyOwner{
        feeclaimer = _claimer;
        emit FeeClaimerChanged(_claimer);
    }

    function setFeeClaimPair(address _claimAddress, address _token, bool _active) external onlyOwner{
        feeClaimMap[_claimAddress][_token] = _active;
        emit FeeClaimPairSet(_claimAddress, _token, _active);
    }

    
    //shutdown this contract.
    function shutdownSystem() external onlyOwner{
        //This version of booster does not require any special steps before shutting down
        //and can just immediately be set.
        isShutdown = true;
        emit Shutdown();
    }

    //vote for gauge weights
    function voteGaugeWeight(address _controller, address[] calldata _gauge, uint256[] calldata _weight) external onlyOwner{
        for(uint256 i = 0; i < _gauge.length; ){
            bytes memory data = abi.encodeWithSelector(bytes4(keccak256("vote_for_gauge_weights(address,uint256)")), _gauge[i], _weight[i]);
            _proxyCall(_controller,data);
            unchecked{ ++i; }
        }
    }

    //set voting delegate
    function setDelegate(address _delegateContract, address _delegate, bytes32 _space) external onlyOwner{
        bytes memory data = abi.encodeWithSelector(bytes4(keccak256("setDelegate(bytes32,address)")), _space, _delegate);
        _proxyCall(_delegateContract,data);
        emit DelegateSet(_delegate);
    }

    //recover tokens on this contract
    function recoverERC20(address _tokenAddress, uint256 _tokenAmount, address _withdrawTo) external onlyOwner{
        IERC20(_tokenAddress).safeTransfer(_withdrawTo, _tokenAmount);
        emit Recovered(_tokenAddress, _tokenAmount);
    }

    //recover tokens on the proxy
    function recoverERC20FromProxy(address _tokenAddress, uint256 _tokenAmount, address _withdrawTo) external onlyOwner{
        bytes memory data = abi.encodeWithSelector(bytes4(keccak256("transfer(address,uint256)")), _withdrawTo, _tokenAmount);
        _proxyCall(_tokenAddress,data);

        emit Recovered(_tokenAddress, _tokenAmount);
    }

    //////// End Owner Section ///////////


    //claim fees - if set, move to a fee queue that rewards can pull from
    function claimFees(address _distroContract, address _token) external {
        require(feeclaimer == address(0) || feeclaimer == msg.sender, "!auth");
        require(feeClaimMap[_distroContract][_token],"!claimPair");

        uint256 bal;
        if(feeQueue != address(0)){
            bal = IStaker(proxy).claimFees(_distroContract, _token, feeQueue);
            if(feeQueueProcess){
                IFeeReceiver(feeQueue).processFees();
            }
        }else{
            bal = IStaker(proxy).claimFees(_distroContract, _token, address(this));
        }
        emit FeesClaimed(bal);
    }

    //call vefxs checkpoint
    function checkpointFeeRewards(address _distroContract) external {
        require(feeclaimer == address(0) || feeclaimer == msg.sender, "!auth");

        IStaker(proxy).checkpointFeeRewards(_distroContract);
    }

    
    /* ========== EVENTS ========== */
    event SetPendingOwner(address indexed _address);
    event OwnerChanged(address indexed _address);
    event FeeQueueChanged(address indexed _address, bool _useProcess);
    event FeeClaimerChanged(address indexed _address);
    event FeeClaimPairSet(address indexed _address, address indexed _token, bool _value);
    event Shutdown();
    event DelegateSet(address indexed _address);
    event FeesClaimed(uint256 _amount);
    event Recovered(address indexed _token, uint256 _amount);
}