// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IWalletChecker{
    function approveWallet(address) external;
    function check(address) external view returns (bool);
    function owner() external view returns(address);
}