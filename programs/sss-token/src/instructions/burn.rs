use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use spl_token_2022::instruction as token_instruction;

use crate::state::*;
use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::TokensBurned;

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    pub burner: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), burner.key().as_ref()],
        bump = role.bump,
    )]
    pub role: Account<'info, RoleAccount>,

    /// CHECK: Token-2022 mint
    #[account(mut)]
    pub mint: AccountInfo<'info>,

    /// CHECK: Burner's token account
    #[account(mut)]
    pub burner_token_account: AccountInfo<'info>,

    pub token_program: AccountInfo<'info>,
}

pub fn handler(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, StablecoinError::ZeroAmount);
    require!(!ctx.accounts.stablecoin.paused, StablecoinError::Paused);
    require!(ctx.accounts.role.roles.is_burner, StablecoinError::Unauthorized);

    // CPI: burn — burner signs as token account owner
    invoke(
        &token_instruction::burn(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.burner_token_account.key(),
            &ctx.accounts.mint.key(),
            &ctx.accounts.burner.key(),
            &[],
            amount,
        )?,
        &[
            ctx.accounts.burner_token_account.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.burner.to_account_info(),
        ],
    )?;

    // Update global stats
    let stablecoin = &mut ctx.accounts.stablecoin;
    stablecoin.total_burned = stablecoin
        .total_burned
        .checked_add(amount)
        .ok_or(StablecoinError::MathOverflow)?;

    emit!(TokensBurned {
        stablecoin: stablecoin.key(),
        burner: ctx.accounts.burner.key(),
        amount,
        total_burned: stablecoin.total_burned,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
