/** Types for `dev-lan.mjs`, which `vite.config.ts` imports for the LAN address. */
export interface LanAddress {
  /** Interface name, e.g. `en0`. */
  name: string;
  /** IPv4 address other devices on the network can reach. */
  address: string;
}

export function findLanAddress(
  interfaces?: NodeJS.Dict<Array<{ family: string | number; internal: boolean; address: string }>>,
  preferred?: string | null,
): LanAddress | null;
