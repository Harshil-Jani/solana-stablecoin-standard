use anchor_lang::prelude::*;

use crate::state::*;
use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::{StablecoinPaused, StablecoinUnpaused};

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

pub fn pause_handler(ctx: Context<PauseUnpause>) -> Result<()> {
    require!(ctx.accounts.role.roles.is_pauser, StablecoinError::Unauthorized);

    ctx.accounts.stablecoin.paused = true;

    emit!(StablecoinPaused {
        stablecoin: ctx.accounts.stablecoin.key(),
        paused_by: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

pub fn unpause_handler(ctx: Context<PauseUnpause>) -> Result<()> {
    require!(ctx.accounts.role.roles.is_pauser, StablecoinError::Unauthorized);

    ctx.accounts.stablecoin.paused = false;

    emit!(StablecoinUnpaused {
        stablecoin: ctx.accounts.stablecoin.key(),
        unpaused_by: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
