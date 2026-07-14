'use strict';

const SENDER_PROFILES = Object.freeze([
  Object.freeze({ id: 'mud-ledger', name: 'MUD Ledger', kind: 'ledger' }),
  Object.freeze({ id: 'oni-ledger', name: 'ONI Ledger', kind: 'ledger' }),
  Object.freeze({ id: 'ustur-ledger', name: 'USTUR Ledger', kind: 'ledger' }),
  Object.freeze({ id: 'gm-hot-wallet', name: 'GM Market Bot', kind: 'hot-wallet' }),
]);

function getSenderProfile(profileId) {
  return SENDER_PROFILES.find((profile) => profile.id === profileId) || null;
}

module.exports = { SENDER_PROFILES, getSenderProfile };
