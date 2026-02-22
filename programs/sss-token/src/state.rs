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
    /// PDA bump
    pub bump: u8,
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
        + 1;                    // bump

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

/// Bitflag roles for gas-efficient storage.
/// Each role maps to a specific capability in the stablecoin system.
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
    /// Running total of tokens minted by this minter
    pub minted_amount: u64,
    pub bump: u8,
}

impl MinterInfo {
    pub const LEN: usize = 8   // discriminator
        + 32                    // stablecoin
        + 32                    // minter
        + 8                     // quota
        + 8                     // minted_amount
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
