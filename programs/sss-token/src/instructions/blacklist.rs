use anchor_lang::prelude::*;

use crate::state::*;
use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::{AddedToBlacklist, RemovedFromBlacklist};

#[derive(Accounts)]
pub struct AddToBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), blacklister.key().as_ref()],
        bump = role.bump,
    )]
    pub role: Account<'info, RoleAccount>,

    #[account(
        init,
        payer = blacklister,
        space = BlacklistEntry::LEN,
        seeds = [BLACKLIST_SEED, stablecoin.key().as_ref(), address.key().as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    /// CHECK: The address being blacklisted
    pub address: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveFromBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), blacklister.key().as_ref()],
        bump = role.bump,
    )]
    pub role: Account<'info, RoleAccount>,

    #[account(
        mut,
        close = blacklister,
        seeds = [BLACKLIST_SEED, stablecoin.key().as_ref(), address.key().as_ref()],
        bump = blacklist_entry.bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    /// CHECK: The address being removed from blacklist
    pub address: AccountInfo<'info>,
}

pub fn add_handler(ctx: Context<AddToBlacklist>, reason: String) -> Result<()> {
    // Feature gate: only SSS-2 tokens support blacklisting
    require!(ctx.accounts.stablecoin.is_sss2(), StablecoinError::ComplianceNotEnabled);
    require!(ctx.accounts.role.roles.is_blacklister, StablecoinError::Unauthorized);
    require!(reason.len() <= MAX_REASON_LEN, StablecoinError::ReasonTooLong);

    let entry = &mut ctx.accounts.blacklist_entry;
    entry.stablecoin = ctx.accounts.stablecoin.key();
    entry.address = ctx.accounts.address.key();
    entry.reason = reason.clone();
    entry.blacklisted_at = Clock::get()?.unix_timestamp;
    entry.blacklisted_by = ctx.accounts.blacklister.key();
    entry.bump = ctx.bumps.blacklist_entry;

    emit!(AddedToBlacklist {
        stablecoin: ctx.accounts.stablecoin.key(),
        address: ctx.accounts.address.key(),
        reason,
        blacklisted_by: ctx.accounts.blacklister.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

pub fn remove_handler(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
    // Feature gate
    require!(ctx.accounts.stablecoin.is_sss2(), StablecoinError::ComplianceNotEnabled);
    require!(ctx.accounts.role.roles.is_blacklister, StablecoinError::Unauthorized);

    emit!(RemovedFromBlacklist {
        stablecoin: ctx.accounts.stablecoin.key(),
        address: ctx.accounts.address.key(),
        removed_by: ctx.accounts.blacklister.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    // Account is closed via Anchor's `close = blacklister` constraint
    Ok(())
}
