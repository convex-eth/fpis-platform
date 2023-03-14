// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./interfaces/IFeeReceiver.sol";
import "./interfaces/IRewards.sol";
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';



contract FeeReceiverCvxFpis is IFeeReceiver {
    using SafeERC20 for IERC20;

    address public constant fpis = address(0xc2544A32872A91F4A553b404C6950e89De901fdb);
    address public constant cvx = address(0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B);
    address public constant cvxDistro = address(0x449f2fd99174e1785CF2A1c79E665Fec3dD1DdC6);
    address public immutable rewardAddress;

    event RewardsDistributed(address indexed token, uint256 amount);

    constructor(address _rewardAddress) {
        rewardAddress = _rewardAddress;
        IERC20(fpis).approve(rewardAddress, type(uint256).max);
        IERC20(cvx).approve(rewardAddress, type(uint256).max);
    }

    function processFees() external {
        uint256 tokenbalance = IERC20(fpis).balanceOf(address(this));
       
        //process fpis
        if(tokenbalance > 0){
            //send to rewards
            IRewards(rewardAddress).notifyRewardAmount(fpis, tokenbalance);
            emit RewardsDistributed(fpis, tokenbalance);
        }

        IRewards(cvxDistro).getReward(address(this));
        tokenbalance = IERC20(cvx).balanceOf(address(this));
       
        //process cvx
        if(tokenbalance > 0){
            //send to rewards
            IRewards(rewardAddress).notifyRewardAmount(cvx, tokenbalance);
            emit RewardsDistributed(cvx, tokenbalance);
        }
    }

}