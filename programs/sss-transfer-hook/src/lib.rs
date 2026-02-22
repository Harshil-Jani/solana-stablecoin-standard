use anchor_lang::prelude::*;
use anchor_lang::system_program::System;

pub mod error;

declare_id!("F2of7agMFET8v3verXe3e6Hmfd71t833RjPxEjs5wRdd");

/// Seed for the ExtraAccountMetaList PDA (stores which extra accounts Token-2022
/// must pass to the hook on every transfer).
pub const EXTRA_ACCOUNT_METAS_SEED: &[u8] = b"extra-account-metas";

#[program]
pub mod sss_transfer_hook {
    use super::*;

    /// Initialize the ExtraAccountMetaList PDA.
    /// Called once after creating a mint with a transfer hook extension.
    /// Tells Token-2022 which extra accounts to include on every transfer CPI.
    pub fn initialize_extra_account_meta_list(
        _ctx: Context<InitializeExtraAccountMetas>,
        _stablecoin: Pubkey,
    ) -> Result<()> {
        // TODO: Implement in Commit 9
        // Will populate ExtraAccountMetaList with:
        // 1. Stablecoin state PDA (to check paused flag)
        // 2. Source wallet blacklist entry PDA (dynamic, derived from source)
        // 3. Destination wallet blacklist entry PDA (dynamic, derived from dest)
        // 4. The sss-token program ID (for PDA derivation)
        Ok(())
    }

    /// Fallback instruction handler — catches the SPL Transfer Hook `Execute`
    /// instruction that Token-2022 CPIs on every transfer.
    ///
    /// Discriminator: [105, 37, 101, 197, 75, 251, 102, 26]
    pub fn fallback<'info>(
        _program_id: &Pubkey,
        _accounts: &'info [AccountInfo<'info>],
        _data: &[u8],
    ) -> Result<()> {
        // TODO: Implement in Commit 9
        // Will:
        // 1. Verify instruction discriminator matches Execute
        // 2. Deserialize accounts (source, mint, dest, owner, extra_meta_list, ...)
        // 3. Check if stablecoin is paused → deny if so
        // 4. Check source blacklist PDA → deny if account exists
        // 5. Check destination blacklist PDA → deny if account exists
        // 6. Return Ok(()) to allow transfer
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetas<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: The ExtraAccountMetaList PDA — will be initialized via CPI.
    /// Seeds: ["extra-account-metas", mint]
    #[account(mut)]
    pub extra_account_meta_list: AccountInfo<'info>,

    /// CHECK: The Token-2022 mint that has this hook attached
    pub mint: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
