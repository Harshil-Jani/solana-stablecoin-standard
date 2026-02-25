use anchor_lang::prelude::*;

use crate::constants::*;

/// Main stablecoin configuration PDA.
/// Seeds: [b"stablecoin", mint.key().as_ref()]
#[account]
pub struct StablecoinState {
    /// Master authority who can update roles and transfer authority
    pub authority: Pubkey,
    /// Token-2022 mint address
    pub mint: Pubkey,
    /// Token metadata
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    /// Feature flags (immutable after init)
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
    /// Operational state
    pub paused: bool,
    pub total_minted: u64,
    pub total_burned: u64,
    /// Supply cap (0 = uncapped). Placed AFTER total_burned and BEFORE bump
    /// to avoid breaking the transfer hook's read_paused_flag() byte walker.
    pub max_supply: u64,
    /// PDA bump
    pub bump: u8,
    /// Two-step authority transfer: pending authority must call accept_authority.
    /// Prevents accidental lockout from typos in authority pubkey.
    pub pending_authority: Option<Pubkey>,
}

impl StablecoinState {
    pub const LEN: usize = 8   // discriminator
        + 32                    // authority
        + 32                    // mint
        + (4 + MAX_NAME_LEN)    // name (string prefix + max chars)
        + (4 + MAX_SYMBOL_LEN)  // symbol
        + (4 + MAX_URI_LEN)     // uri
        + 1                     // decimals
        + 1                     // enable_permanent_delegate
        + 1                     // enable_transfer_hook
        + 1                     // default_account_frozen
        + 1                     // paused
        + 8                     // total_minted
        + 8                     // total_burned
        + 8                     // max_supply
        + 1                     // bump
        + (1 + 32);             // pending_authority (Option<Pubkey>)

    pub fn is_sss2(&self) -> bool {
        self.enable_permanent_delegate && self.enable_transfer_hook
    }
}

/// Role assignment PDA.
/// Seeds: [b"role", stablecoin.key().as_ref(), holder.key().as_ref()]
#[account]
pub struct RoleAccount {
    pub stablecoin: Pubkey,
    pub holder: Pubkey,
    pub roles: RoleFlags,
    pub bump: u8,
}

impl RoleAccount {
    pub const LEN: usize = 8   // discriminator
        + 32                    // stablecoin
        + 32                    // holder
        + RoleFlags::LEN        // roles
        + 1;                    // bump
}

/// Boolean role flags for the stablecoin system.
/// Each flag maps to a specific capability (minter, burner, pauser, etc.).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, Debug)]
pub struct RoleFlags {
    pub is_minter: bool,
    pub is_burner: bool,
    pub is_pauser: bool,
    pub is_blacklister: bool,
    pub is_seizer: bool,
}

impl RoleFlags {
    pub const LEN: usize = 5; // 5 booleans
}

/// Per-minter quota tracking PDA.
/// Seeds: [b"minter", stablecoin.key().as_ref(), minter.key().as_ref()]
#[account]
pub struct MinterInfo {
    pub stablecoin: Pubkey,
    pub minter: Pubkey,
    /// Maximum amount this minter is allowed to mint
    pub quota: u64,
    /// Running total of tokens minted by this minter (lifetime)
    pub minted_amount: u64,
    /// Epoch-based quota auto-reset: 0 = no reset (lifetime). e.g., 86400 for daily.
    pub epoch_duration: i64,
    /// Unix timestamp of current epoch start
    pub epoch_start: i64,
    /// Running total of tokens minted in the current epoch
    pub minted_this_epoch: u64,
    pub bump: u8,
}

impl MinterInfo {
    pub const LEN: usize = 8   // discriminator
        + 32                    // stablecoin
        + 32                    // minter
        + 8                     // quota
        + 8                     // minted_amount
        + 8                     // epoch_duration
        + 8                     // epoch_start
        + 8                     // minted_this_epoch
        + 1;                    // bump
}

/// Blacklist entry PDA (SSS-2 only).
/// Seeds: [b"blacklist", stablecoin.key().as_ref(), address.key().as_ref()]
#[account]
pub struct BlacklistEntry {
    pub stablecoin: Pubkey,
    pub address: Pubkey,
    pub reason: String,
    pub blacklisted_at: i64,
    pub blacklisted_by: Pubkey,
    pub bump: u8,
}

impl BlacklistEntry {
    pub const LEN: usize = 8   // discriminator
        + 32                    // stablecoin
        + 32                    // address
        + (4 + MAX_REASON_LEN)  // reason
        + 8                     // blacklisted_at
        + 32                    // blacklisted_by
        + 1;                    // bump
}

/// Multi-sig configuration PDA.
/// Seeds: [b"multisig", stablecoin.key().as_ref()]
#[account]
pub struct MultisigConfig {
    pub stablecoin: Pubkey,
    pub signers: Vec<Pubkey>,
    pub threshold: u8,
    pub proposal_count: u64,
    pub bump: u8,
}

impl MultisigConfig {
    pub const MAX_SIGNERS: usize = 10;
    pub const LEN: usize = 8   // discriminator
        + 32                    // stablecoin
        + (4 + 32 * Self::MAX_SIGNERS) // signers vec
        + 1                     // threshold
        + 8                     // proposal_count
        + 1;                    // bump
}

/// Instruction types for multisig proposals and timelocked operations.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum InstructionType {
    Pause,
    Unpause,
    UpdateRoles,
    UpdateMinter,
    TransferAuthority,
    AddToBlacklist,
    RemoveFromBlacklist,
    UpdateSupplyCap,
    ConfigureTransferLimits,
}

/// Multi-sig proposal PDA.
/// Seeds: [b"proposal", stablecoin.key().as_ref(), proposal_id.to_le_bytes()]
#[account]
pub struct Proposal {
    pub stablecoin: Pubkey,
    pub proposal_id: u64,
    pub proposer: Pubkey,
    pub instruction_type: InstructionType,
    pub data: Vec<u8>,
    pub approvals: Vec<bool>,
    pub approval_count: u8,
    pub executed: bool,
    pub cancelled: bool,
    pub created_at: i64,
    pub bump: u8,
}

impl Proposal {
    pub const MAX_DATA_LEN: usize = 256;
    pub const LEN: usize = 8   // discriminator
        + 32                    // stablecoin
        + 8                     // proposal_id
        + 32                    // proposer
        + 1                     // instruction_type (enum)
        + (4 + Self::MAX_DATA_LEN) // data vec
        + (4 + MultisigConfig::MAX_SIGNERS) // approvals vec
        + 1                     // approval_count
        + 1                     // executed
        + 1                     // cancelled
        + 8                     // created_at
        + 1;                    // bump
}

/// Timelock configuration PDA.
/// Seeds: [b"timelock_config", stablecoin.key().as_ref()]
#[account]
pub struct TimelockConfig {
    pub stablecoin: Pubkey,
    pub delay: i64,
    pub enabled: bool,
    pub bump: u8,
}

impl TimelockConfig {
    pub const LEN: usize = 8   // discriminator
        + 32                    // stablecoin
        + 8                     // delay
        + 1                     // enabled
        + 1;                    // bump
}

/// Timelock operation PDA.
/// Seeds: [b"timelock", stablecoin.key().as_ref(), op_id.to_le_bytes()]
#[account]
pub struct TimelockOperation {
    pub stablecoin: Pubkey,
    pub op_id: u64,
    pub op_type: InstructionType,
    pub data: Vec<u8>,
    pub eta: i64,
    pub proposer: Pubkey,
    pub executed: bool,
    pub cancelled: bool,
    pub bump: u8,
}

impl TimelockOperation {
    pub const MAX_DATA_LEN: usize = 256;
    pub const LEN: usize = 8   // discriminator
        + 32                    // stablecoin
        + 8                     // op_id
        + 1                     // op_type (enum)
        + (4 + Self::MAX_DATA_LEN) // data vec
        + 8                     // eta
        + 32                    // proposer
        + 1                     // executed
        + 1                     // cancelled
        + 1;                    // bump
}

/// Transfer limit configuration PDA.
/// Seeds: [b"transfer_limit", stablecoin.key().as_ref()]
#[account]
pub struct TransferLimitConfig {
    pub stablecoin: Pubkey,
    pub max_per_tx: u64,
    pub max_per_day: u64,
    pub daily_transferred: u64,
    pub day_start: i64,
    pub bump: u8,
}

impl TransferLimitConfig {
    pub const LEN: usize = 8   // discriminator
        + 32                    // stablecoin
        + 8                     // max_per_tx
        + 8                     // max_per_day
        + 8                     // daily_transferred
        + 8                     // day_start
        + 1;                    // bump
}
