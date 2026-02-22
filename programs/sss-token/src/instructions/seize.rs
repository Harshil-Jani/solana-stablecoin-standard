use anchor_lang::prelude::*;

use crate::state::*;
use crate::constants::*;

#[derive(Accounts)]
pub struct Seize<'info> {
    pub seizer: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), seizer.key().as_ref()],
        bump = role.bump,
    )]
    pub role: Account<'info, RoleAccount>,

    /// CHECK: Token-2022 mint
    pub mint: AccountInfo<'info>,

    /// CHECK: Source token account to seize from
    #[account(mut)]
    pub source_token_account: AccountInfo<'info>,

    /// CHECK: Destination treasury token account
    #[account(mut)]
    pub destination_token_account: AccountInfo<'info>,

    pub token_program: AccountInfo<'info>,
}

pub fn handler(_ctx: Context<Seize>) -> Result<()> {
    // TODO: Implement in Commit 8
    Ok(())
}
