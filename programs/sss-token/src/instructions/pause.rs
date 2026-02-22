use anchor_lang::prelude::*;

use crate::state::*;
use crate::constants::*;

#[derive(Accounts)]
pub struct PauseUnpause<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), authority.key().as_ref()],
        bump = role.bump,
    )]
    pub role: Account<'info, RoleAccount>,
}

pub fn pause_handler(_ctx: Context<PauseUnpause>) -> Result<()> {
    // TODO: Implement in Commit 6
    Ok(())
}

pub fn unpause_handler(_ctx: Context<PauseUnpause>) -> Result<()> {
    // TODO: Implement in Commit 6
    Ok(())
}
