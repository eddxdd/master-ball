/**
 * Canonical list of the 151 Kanto Pokémon in Pokédex order (#001–#151).
 * Names match PokeAPI / database (lowercase; nidoran-f, nidoran-m, mr-mime, farfetchd).
 * Source: https://bulbapedia.bulbagarden.net/wiki/List_of_Pokémon_by_Kanto_Pokédex_number
 */
export const KANTO_151_NAMES: readonly string[] = [
  'bulbasaur', 'ivysaur', 'venusaur', 'charmander', 'charmeleon', 'charizard',
  'squirtle', 'wartortle', 'blastoise', 'caterpie', 'metapod', 'butterfree',
  'weedle', 'kakuna', 'beedrill', 'pidgey', 'pidgeotto', 'pidgeot',
  'rattata', 'raticate', 'spearow', 'fearow', 'ekans', 'arbok',
  'pikachu', 'raichu', 'sandshrew', 'sandslash', 'nidoran-f', 'nidorina', 'nidoqueen',
  'nidoran-m', 'nidorino', 'nidoking', 'clefairy', 'clefable', 'vulpix', 'ninetales',
  'jigglypuff', 'wigglytuff', 'zubat', 'golbat', 'oddish', 'gloom', 'vileplume',
  'paras', 'parasect', 'venonat', 'venomoth', 'diglett', 'dugtrio',
  'meowth', 'persian', 'psyduck', 'golduck', 'mankey', 'primeape',
  'growlithe', 'arcanine', 'poliwag', 'poliwhirl', 'poliwrath',
  'abra', 'kadabra', 'alakazam', 'machop', 'machoke', 'machamp',
  'bellsprout', 'weepinbell', 'victreebel', 'tentacool', 'tentacruel',
  'geodude', 'graveler', 'golem', 'ponyta', 'rapidash',
  'slowpoke', 'slowbro', 'magnemite', 'magneton', 'farfetchd', 'doduo', 'dodrio',
  'seel', 'dewgong', 'grimer', 'muk', 'shellder', 'cloyster',
  'gastly', 'haunter', 'gengar', 'onix', 'drowzee', 'hypno',
  'krabby', 'kingler', 'voltorb', 'electrode', 'exeggcute', 'exeggutor',
  'cubone', 'marowak', 'hitmonlee', 'hitmonchan', 'lickitung',
  'koffing', 'weezing', 'rhyhorn', 'rhydon', 'chansey', 'tangela', 'kangaskhan',
  'horsea', 'seadra', 'goldeen', 'seaking', 'staryu', 'starmie', 'mr-mime',
  'scyther', 'jynx', 'electabuzz', 'magmar', 'pinsir', 'tauros',
  'magikarp', 'gyarados', 'lapras', 'ditto', 'eevee', 'vaporeon', 'jolteon', 'flareon',
  'porygon', 'omanyte', 'omastar', 'kabuto', 'kabutops', 'aerodactyl',
  'snorlax', 'articuno', 'zapdos', 'moltres', 'dratini', 'dragonair', 'dragonite',
  'mewtwo', 'mew',
] as const;

export const KANTO_151_COUNT = KANTO_151_NAMES.length;

if (KANTO_151_COUNT !== 151) {
  throw new Error(`Kanto list must have exactly 151 names, got ${KANTO_151_COUNT}`);
}
