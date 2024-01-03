// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./interfaces/IFpisDepositor.sol";
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';


/*
Migration processor for convex

Basic function:
- receive fxs from fpis migration
- deposit into convex's fxs depositor and mint cvxfxs
- return cvxfxs to original caller

*/
contract FpisMigrationConvexProcessor{
    using SafeERC20 for IERC20;

    address public constant fxs = address(0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0);
    address public constant cvxFxs = address(0xFEEf77d3f69374f66429C91d732A244f074bdf74);
    address public constant depositor = address(0x8f55d7c21bDFf1A51AFAa60f3De7590222A3181e);

    event Processed(address indexed _target, uint256 _amount);

    constructor() {
        IERC20(fxs).safeApprove(depositor, type(uint256).max);
    }

    //lock fxs thats residing on this contract for cvxfxs and return to target
    function lockFor(address _target, uint256 _amount) external{
        //deposit for cvxfxs
        IFpisDepositor(depositor).deposit(_amount, false);

        //send minted cvxfxs back to _target
        IERC20(cvxFxs).safeTransfer(_target, _amount);

        emit Processed( _target, _amount);
    }
}