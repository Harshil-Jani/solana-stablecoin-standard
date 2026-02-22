use anchor_lang::prelude::*;

use crate::state::*;
use crate::constants::*;
use crate::error::StablecoinError;

#[derive(Accounts)]
pub struct ConfigureTransferLimits<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        constraint = stablecoin.authority == authority.key(),
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        init_if_needed,
        payer = authority,
        space = TransferLimitConfig::LEN,
        seeds = [TRANSFER_LIMIT_SEED, stablecoin.key().as_ref()],
        bump,
    )]
    pub transfer_limit_config: Account<'info, TransferLimitConfig>,

    pub system_program: Program<'info, System>,
}

pub fn configure_transfer_limits_handler(ctx: Context<ConfigureTransferLimits>, max_per_tx: u64, max_per_day: u64) -> Result<()> {
    // Only SSS-2 tokens support transfer limits (requires transfer hook)
    require!(ctx.accounts.stablecoin.is_sss2(), StablecoinError::ComplianceNotEnabled);

    let config = &mut ctx.accounts.transfer_limit_config;
    config.stablecoin = ctx.accounts.stablecoin.key();
    config.max_per_tx = max_per_tx;
    config.max_per_day = max_per_day;

    // Reset daily tracking if this is a fresh config
    if config.day_start == 0 {
        config.daily_transferred = 0;
        config.day_start = Clock::get()?.unix_timestamp;
    }

    config.bump = ctx.bumps.transfer_limit_config;

    Ok(())
}
