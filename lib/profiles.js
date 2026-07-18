'use strict';

function getSenderProfile(wallets, profileId) {
  const rows = Array.isArray(wallets) ? wallets : [];
  return rows.find((profile) => profile.id === profileId) || null;
}

module.exports = { getSenderProfile };
