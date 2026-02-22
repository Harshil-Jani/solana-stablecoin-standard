use anchor_lang::prelude::*;

use crate::state::*;
use crate::constants::*;
use crate::events::AuthorityTransferred;

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

pub fn handler(ctx: Context<TransferAuthority>) -> Result<()> {
    let previous_authority = ctx.accounts.stablecoin.authority;
    ctx.accounts.stablecoin.authority = ctx.accounts.new_authority.key();

    emit!(AuthorityTransferred {
        stablecoin: ctx.accounts.stablecoin.key(),
        previous_authority,
        new_authority: ctx.accounts.new_authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
