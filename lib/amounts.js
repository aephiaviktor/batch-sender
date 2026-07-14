'use strict';

function normalizeDecimals(decimals) {
  const value = Number(decimals);
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error('Token decimals must be an integer between 0 and 255.');
  }
  return value;
}

function parseTokenAmount(rawAmount, decimals) {
  const decimalPlaces = normalizeDecimals(decimals);
  const text = String(rawAmount ?? '').trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error('Amount must be a positive number.');
  }

  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimalPlaces) {
    throw new Error(`Amount has more than ${decimalPlaces} decimal place${decimalPlaces === 1 ? '' : 's'}.`);
  }

  const scale = 10n ** BigInt(decimalPlaces);
  const paddedFraction = fraction.padEnd(decimalPlaces, '0');
  const baseUnits = BigInt(whole) * scale + BigInt(paddedFraction || '0');
  if (baseUnits <= 0n) {
    throw new Error('Amount must be greater than 0.');
  }
  return baseUnits;
}

function formatBaseUnits(rawAmount, decimals) {
  const decimalPlaces = normalizeDecimals(decimals);
  const value = BigInt(rawAmount);
  if (value < 0n) {
    throw new Error('Token amount cannot be negative.');
  }

  const scale = 10n ** BigInt(decimalPlaces);
  const whole = value / scale;
  const fraction = decimalPlaces === 0
    ? ''
    : (value % scale).toString().padStart(decimalPlaces, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function addThousandsSeparators(rawAmount) {
  const text = String(rawAmount ?? '').trim().replace(/,/g, '');
  if (!/^\d*(\.\d*)?$/.test(text)) {
    return String(rawAmount ?? '');
  }
  const [whole = '', fraction] = text.split('.');
  const formattedWhole = whole.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? formattedWhole : `${formattedWhole}.${fraction}`;
}

module.exports = {
  addThousandsSeparators,
  formatBaseUnits,
  parseTokenAmount,
};
