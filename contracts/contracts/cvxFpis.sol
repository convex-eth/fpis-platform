// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';


contract cvxFpisToken is ERC20 {

    address public immutable owner;
    mapping(address => bool) public operators;
    event SetOperator(address indexed _operator, bool _active);

    constructor(address _owner)
        ERC20(
            "Convex FPIS",
            "cvxFPIS"
        )
    {
        owner = _owner;
    }

   function setOperator(address _operator, bool _active) external {
        require(msg.sender == owner, "!auth");
        operators[_operator] = _active;
        emit SetOperator(_operator, _active);
    }

    
    function mint(address _to, uint256 _amount) external {
        require(operators[msg.sender], "!authorized");
        
        _mint(_to, _amount);
    }

    function burn(address _from, uint256 _amount) external {
        require(operators[msg.sender], "!authorized");
        
        _burn(_from, _amount);
    }

}