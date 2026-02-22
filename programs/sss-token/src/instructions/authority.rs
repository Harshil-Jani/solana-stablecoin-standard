use anchor_lang::prelude::*;

use crate::state::*;
use crate::constants::*;

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        constraint = stablecoin.authority == authority.key(),
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    /// CHECK: The new authority
    pub new_authority: AccountInfo<'info>,
}

pub fn handler(_ctx: Context<TransferAuthority>) -> Result<()> {
    // TODO: Implement in Commit 6
    Ok(())
}
