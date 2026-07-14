'use strict';

// Canonical raw-material/component subset extracted from LM Market Bot's asset registry.
const TOKEN_CATALOG = Object.freeze([
  { name: 'Arco', mint: 'ARCoQ9dndpg6wE2rRexzfwgJR3NoWWhpcww3xQcQLukg', group: 'raw' },
  { name: 'Biomass', mint: 'MASS9GqtJz6ABisAxcUn3FeR4phMqH1XfG6LPKJePog', group: 'raw' },
  { name: 'Carbon', mint: 'CARBWKWvxEuMcq3MqCxYfi7UoFVpL9c4rsQS99tw6i4X', group: 'raw' },
  { name: 'Copper Ore', mint: 'CUore1tNkiubxSwDEtLc3Ybs1xfWLs8uGjyydUYZ25xc', group: 'raw' },
  { name: 'Diamond', mint: 'DMNDKqygEN3WXKVrAD4ofkYBc4CKNRhFUbXP4VK7a944', group: 'raw' },
  { name: 'Hydrogen', mint: 'HYDR4EPHJcDPcaLYUcNCtrXUdt1PnaN4MvE655pevBYp', group: 'raw' },
  { name: 'Iron Ore', mint: 'FeorejFjRRAfusN9Fg3WjEZ1dRCf74o6xwT5vDt3R34J', group: 'raw' },
  { name: 'Lumanite', mint: 'LUMACqD5LaKjs1AeuJYToybasTXoYQ7YkxJEc4jowNj', group: 'raw' },
  { name: 'Nitrogen', mint: 'Nitro6idW5JCb2ysUPGUAvVqv3HmUR7NVH7NdybGJ4L', group: 'raw' },
  { name: 'Rochinol', mint: 'RCH1Zhg4zcSSQK8rw2s6rDMVsgBEWa4kiv1oLFndrN5', group: 'raw' },
  { name: 'Silica', mint: 'SiLiCA4xKGkyymB5XteUVmUeLqE4JGQTyWBpKFESLgh', group: 'raw' },
  { name: 'Titanium Ore', mint: 'tiorehR1rLfeATZ96YoByUkvNFsBfUUSQWgSH2mizXL', group: 'raw' },
  { name: 'Ammo', mint: 'ammoK8AkX2wnebQb35cDAZtTkvsXQbi82cGeTnUvvfK', group: 'components' },
  { name: 'Copper', mint: 'CPPRam7wKuBkYzN5zCffgNU17RKaeMEns4ZD83BqBVNR', group: 'components' },
  { name: 'Copper Wire', mint: 'cwirGHLB2heKjCeTy4Mbp4M443fU4V7vy2JouvYbZna', group: 'components' },
  { name: 'Crystal Lattice', mint: 'CRYSNnUd7cZvVfrEVtVNKmXiCPYdZ1S5pM5qG2FDVZHF', group: 'components' },
  { name: 'Electromagnet', mint: 'EMAGoQSP89CJV5focVjrpEuE4CeqJ4k1DouQW7gUu7yX', group: 'components' },
  { name: 'Electronics', mint: 'ELECrjC8m9GxCqcm4XCNpFvkS8fHStAvymS6MJbe3XLZ', group: 'components' },
  { name: 'Energy Substrate', mint: 'SUBSVX9LYiPrzHeg2bZrqFSDSKkrQkiCesr6SjtdHaX', group: 'components' },
  { name: 'Field Stabilizers', mint: 'FiELD9fGaCgiNMfzQKKZD78wxwnBHTwjiiJfsieb6VGb', group: 'components' },
  { name: 'Food', mint: 'foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG', group: 'components' },
  { name: 'Framework', mint: 'FMWKb7YJA5upZHbu5FjVRRoxdDw2FYFAu284VqUGF9C2', group: 'components' },
  { name: 'Fuel', mint: 'fueL3hBZjLLLJHiFH9cqZoozTG3XQZ53diwFPwbzNim', group: 'components' },
  { name: 'Graphene', mint: 'GRAPHKGoKtXtdPBx17h6fWopdT5tLjfAP8cDJ1SvvDn4', group: 'components' },
  { name: 'Hydrocarbon', mint: 'HYCBuSWCJ5ZEyANexU94y1BaBPtAX2kzBgGD2vES2t6M', group: 'components' },
  { name: 'Iron', mint: 'ironxrUhTEaBiR9Pgp6hy4qWx6V2FirDoXhsFP25GFP', group: 'components' },
  { name: 'Magnet', mint: 'MAGNMDeDJLvGAnriBvzWruZHfXNwWHhxnoNF75AQYM5', group: 'components' },
  { name: 'Particle Accelerator', mint: 'PTCLSWbwZ3mqZqHAporphY2ofio8acsastaHfoP87Dc', group: 'components' },
  { name: 'Polymer', mint: 'PoLYs2hbRt5iDibrkPT9e6xWuhSS45yZji5ChgJBvcB', group: 'components' },
  { name: 'Power Source', mint: 'PoWRYJnw3YDSyXgNtN3mQ3TKUMoUSsLAbvE8Ejade3u', group: 'components' },
  { name: 'Radiation Absorber', mint: 'RABSXX6RcqJ1L5qsGY64j91pmbQVbsYRQuw1mmxhxFe', group: 'components' },
  { name: 'Strange Emitter', mint: 'EMiTWSLgjDVkBbLFaMcGU6QqFWzX9JX6kqs1UtUjsmJA', group: 'components' },
  { name: 'Steel', mint: 'STEELXLJ8nfJy3P4aNuGxyNRbWPohqHSwxY75NsJRGG', group: 'components' },
  { name: 'Super Conductor', mint: 'CoNDDRCNxXAMGscCdejioDzb6XKxSzonbWb36wzSgp5T', group: 'components' },
  { name: 'Survey Data Unit', mint: 'SDUsgfSZaDhhZ76U3ZgvtFiXsfnHbf2VrzYxjBZ5YbM', group: 'components' },
  { name: 'Titanium', mint: 'TTNM1SMkM7VKtyPW6CNBZ4cg3An3zzQ8NVLS2HpMaWL', group: 'components' },
  { name: 'Toolkits', mint: 'tooLsNYLiVqzg8o4m3L2Uetbn62mvMWRqkog6PQeYKL', group: 'components' },
].map(Object.freeze));

const TOKEN_BY_MINT = new Map(TOKEN_CATALOG.map((token) => [token.mint, token]));

module.exports = { TOKEN_BY_MINT, TOKEN_CATALOG };
