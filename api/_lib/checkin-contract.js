const { ethers } = require('ethers');
const { normalizeAddress } = require('./evm');

const BASE_CHAIN_ID = 8453;
const DAY_SECONDS = 24 * 60 * 60;
const CHECKIN_ABI = [
  'function checkIn()',
  'function getStats(address account) view returns (uint32 streak, uint64 totalCheckIns, uint64 lastCheckInDay, bool canCheckInNow, uint64 nextCheckInAt)',
  'event CheckedIn(address indexed account, uint32 streak, uint64 totalCheckIns, uint64 day, uint64 nextCheckInAt)'
];

const checkinInterface = new ethers.Interface(CHECKIN_ABI);

function getCheckinContractAddress() {
  return normalizeAddress(process.env.CHECKIN_CONTRACT_ADDRESS);
}

function encodeCheckinCalldata() {
  return checkinInterface.encodeFunctionData('checkIn', []);
}

function toNumber(value, fallback = 0) {
  try {
    if (value === null || value === undefined) return fallback;
    return Number(value);
  } catch {
    return fallback;
  }
}

function normalizeStats(stats) {
  if (!stats) return null;

  return {
    streak: toNumber(stats.streak, 0),
    totalCheckins: toNumber(stats.totalCheckIns, 0),
    lastCheckInDay: toNumber(stats.lastCheckInDay, 0),
    canCheckInNow: Boolean(stats.canCheckInNow),
    nextCheckInAt: toNumber(stats.nextCheckInAt, 0)
  };
}

async function readOnchainStats(provider, contractAddress, account) {
  if (!provider || !contractAddress || !account) return null;
  const normalizedAccount = normalizeAddress(account);
  if (!normalizedAccount) return null;

  const contract = new ethers.Contract(contractAddress, CHECKIN_ABI, provider);
  let raw = null;
  try {
    raw = await contract.getStats(normalizedAccount);
  } catch {
    return null;
  }

  return normalizeStats(raw);
}

function parseCheckinEventFromReceipt(receipt, contractAddress, expectedAccount = null) {
  const target = normalizeAddress(contractAddress);
  if (!target) return null;

  const wanted = normalizeAddress(expectedAccount);
  let firstMatch = null;

  for (const log of receipt?.logs || []) {
    if (normalizeAddress(log.address) !== target) continue;

    let parsed = null;
    try {
      parsed = checkinInterface.parseLog(log);
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.name !== 'CheckedIn') continue;

    const account = normalizeAddress(parsed.args.account);
    if (!account) continue;

    const event = {
      account,
      streak: toNumber(parsed.args.streak, 0),
      totalCheckins: toNumber(parsed.args.totalCheckIns, 0),
      day: toNumber(parsed.args.day, 0),
      nextCheckInAt: toNumber(parsed.args.nextCheckInAt, 0),
      canCheckInNow: false
    };

    // A batched wallet_sendCalls receipt can carry several CheckedIn logs, so
    // prefer the one that belongs to the caller instead of the first one.
    if (wanted && account === wanted) return event;
    if (!firstMatch) firstMatch = event;
  }

  return wanted ? null : firstMatch;
}

module.exports = {
  BASE_CHAIN_ID,
  DAY_SECONDS,
  encodeCheckinCalldata,
  getCheckinContractAddress,
  parseCheckinEventFromReceipt,
  readOnchainStats
};
