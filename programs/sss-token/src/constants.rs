/// PDA seeds
pub const STABLECOIN_SEED: &[u8] = b"stablecoin";
pub const ROLE_SEED: &[u8] = b"role";
pub const MINTER_SEED: &[u8] = b"minter";
pub const BLACKLIST_SEED: &[u8] = b"blacklist";
pub const MULTISIG_SEED: &[u8] = b"multisig";
pub const PROPOSAL_SEED: &[u8] = b"proposal";
pub const TIMELOCK_CONFIG_SEED: &[u8] = b"timelock_config";
pub const TIMELOCK_SEED: &[u8] = b"timelock";
pub const TRANSFER_LIMIT_SEED: &[u8] = b"transfer_limit";

/// Validation limits
pub const MAX_NAME_LEN: usize = 32;
pub const MAX_SYMBOL_LEN: usize = 10;
pub const MAX_URI_LEN: usize = 200;
pub const MAX_REASON_LEN: usize = 100;

/// Batch operations
pub const MAX_BATCH_SIZE: usize = 10;
