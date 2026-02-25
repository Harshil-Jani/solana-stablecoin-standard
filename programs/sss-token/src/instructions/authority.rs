use anchor_lang::prelude::*;

use crate::state::*;
use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::AuthorityTransferred;

// ── Step 1: Propose Authority Transfer ──────────────────────────────

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

    /// CHECK: The proposed new authority
    pub new_authority: AccountInfo<'info>,
}

/// Step 1 of two-step authority transfer: set pending_authority.
/// The new authority must call accept_authority to finalize the transfer.
pub fn transfer_authority_handler(ctx: Context<TransferAuthority>) -> Result<()> {
    ctx.accounts.stablecoin.pending_authority = Some(ctx.accounts.new_authority.key());

    msg!(
        "Authority transfer proposed: {} -> {}",
        ctx.accounts.authority.key(),
        ctx.accounts.new_authority.key()
    );

    Ok(())
}

// ── Step 2: Accept Authority Transfer ───────────────────────────────

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    /// The new authority must sign to prove key ownership.
    pub new_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,
}

/// Step 2 of two-step authority transfer: the pending authority accepts.
/// This proves the new authority controls the key, preventing lockout from typos.
pub fn accept_authority_handler(ctx: Context<AcceptAuthority>) -> Result<()> {
    let stablecoin = &mut ctx.accounts.stablecoin;

    let pending = stablecoin
        .pending_authority
        .ok_or(StablecoinError::NoPendingAuthority)?;

    require!(
        pending == ctx.accounts.new_authority.key(),
        StablecoinError::Unauthorized
    );

    let previous_authority = stablecoin.authority;
    stablecoin.authority = pending;
    stablecoin.pending_authority = None;

    emit!(AuthorityTransferred {
        stablecoin: ctx.accounts.stablecoin.key(),
        previous_authority,
        new_authority: pending,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
