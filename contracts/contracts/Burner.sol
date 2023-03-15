// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./interfaces/ITokenMinter.sol";
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";


contract Burner is ReentrancyGuard{

    address public immutable cvxfpis;
    event Burned(address indexed _address, uint256 _amount);

    constructor(address _cvxfpis){
        cvxfpis = _cvxfpis;
    }

    function burn() external nonReentrant returns(uint256 amount){
        amount = IERC20(cvxfpis).balanceOf(address(this));
        ITokenMinter(cvxfpis).burn(address(this),amount);
        emit Burned(address(this),amount);
    }

    function burnAtSender(uint256 _amount) external nonReentrant returns(uint256 amount){
        ITokenMinter(cvxfpis).burn(msg.sender,_amount);
        emit Burned(msg.sender, _amount);
        return _amount;
    }

}