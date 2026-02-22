import type { StablecoinConfig } from "./types";

/**
 * SSS-1: Minimal Stablecoin Standard
 *
 * Basic token with mint/burn, freeze/thaw, pause controls.
 * No permanent delegate, no transfer hook, accounts start unfrozen.
 */
export function sss1Preset(overrides: Partial<StablecoinConfig> = {}): StablecoinConfig {
  return {
    name: "USD Stablecoin",
    symbol: "USDS",
    uri: "",
    decimals: 6,
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
    ...overrides,
  };
}

/**
 * SSS-2: Compliant Stablecoin Standard
 *
 * Full compliance suite: permanent delegate for seizure,
 * transfer hook for blacklist enforcement on every transfer,
 * and default-frozen accounts requiring explicit thaw (KYC gate).
 */
export function sss2Preset(overrides: Partial<StablecoinConfig> = {}): StablecoinConfig {
  return {
    name: "Compliant USD",
    symbol: "cUSD",
    uri: "",
    decimals: 6,
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: true,
    ...overrides,
  };
}
