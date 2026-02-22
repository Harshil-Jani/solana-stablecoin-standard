use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use spl_token_2022;
use spl_token_2022::instruction as token_instruction;

use crate::state::*;
use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::{AccountFrozen, AccountThawed};

#[derive(Accounts)]
pub struct FreezeTokenAccount<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), authority.key().as_ref()],
        bump = role.bump,
    )]
    pub role: Account<'info, RoleAccount>,

    /// CHECK: Token-2022 mint
    pub mint: AccountInfo<'info>,

    /// CHECK: Token account to freeze
    #[account(mut)]
    pub target_token_account: AccountInfo<'info>,

    /// CHECK: Must be the Token-2022 program — prevents CPI redirection attacks
    #[account(address = spl_token_2022::ID)]
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ThawTokenAccount<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), authority.key().as_ref()],
        bump = role.bump,
    )]
    pub role: Account<'info, RoleAccount>,

    /// CHECK: Token-2022 mint
    pub mint: AccountInfo<'info>,

    /// CHECK: Token account to thaw
    #[account(mut)]
    pub target_token_account: AccountInfo<'info>,

    /// CHECK: Must be the Token-2022 program — prevents CPI redirection attacks
    #[account(address = spl_token_2022::ID)]
    pub token_program: AccountInfo<'info>,
}

pub fn freeze_handler(ctx: Context<FreezeTokenAccount>) -> Result<()> {
    require!(ctx.accounts.role.roles.is_pauser, StablecoinError::Unauthorized);

    // CPI: freeze_account — stablecoin PDA is the freeze authority
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[u8]] = &[STABLECOIN_SEED, mint_key.as_ref(), &[ctx.accounts.stablecoin.bump]];

    invoke_signed(
        &token_instruction::freeze_account(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.target_token_account.key(),
            &ctx.accounts.mint.key(),
            &ctx.accounts.stablecoin.key(),
            &[],
        )?,
        &[
            ctx.accounts.target_token_account.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.stablecoin.to_account_info(),
        ],
        &[signer_seeds],
    )?;

    emit!(AccountFrozen {
        stablecoin: ctx.accounts.stablecoin.key(),
        account: ctx.accounts.target_token_account.key(),
        frozen_by: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

pub fn thaw_handler(ctx: Context<ThawTokenAccount>) -> Result<()> {
    require!(ctx.accounts.role.roles.is_pauser, StablecoinError::Unauthorized);

    // CPI: thaw_account — stablecoin PDA is the freeze authority
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[u8]] = &[STABLECOIN_SEED, mint_key.as_ref(), &[ctx.accounts.stablecoin.bump]];

    invoke_signed(
        &token_instruction::thaw_account(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.target_token_account.key(),
            &ctx.accounts.mint.key(),
            &ctx.accounts.stablecoin.key(),
            &[],
        )?,
        &[
            ctx.accounts.target_token_account.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.stablecoin.to_account_info(),
        ],
        &[signer_seeds],
    )?;

    emit!(AccountThawed {
        stablecoin: ctx.accounts.stablecoin.key(),
        account: ctx.accounts.target_token_account.key(),
        thawed_by: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
