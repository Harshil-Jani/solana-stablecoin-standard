use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use spl_token_2022::instruction as token_instruction;

use crate::state::*;
use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::TokensMinted;

#[derive(Accounts)]
pub struct MintTokens<'info> {
    pub minter: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), minter.key().as_ref()],
        bump = role.bump,
    )]
    pub role: Account<'info, RoleAccount>,

    #[account(
        mut,
        seeds = [MINTER_SEED, stablecoin.key().as_ref(), minter.key().as_ref()],
        bump = minter_info.bump,
    )]
    pub minter_info: Account<'info, MinterInfo>,

    /// CHECK: Token-2022 mint
    #[account(mut)]
    pub mint: AccountInfo<'info>,

    /// CHECK: Recipient token account
    #[account(mut)]
    pub recipient_token_account: AccountInfo<'info>,

    /// CHECK: Must be the Token-2022 program — prevents CPI redirection attacks
    #[account(address = spl_token_2022::ID)]
    pub token_program: AccountInfo<'info>,
}

pub fn handler(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, StablecoinError::ZeroAmount);
    require!(!ctx.accounts.stablecoin.paused, StablecoinError::Paused);
    require!(ctx.accounts.role.roles.is_minter, StablecoinError::Unauthorized);

    // ── Supply cap enforcement (Feature 8) ──────────────────────────
    let stablecoin = &ctx.accounts.stablecoin;
    if stablecoin.max_supply > 0 {
        let circulating = stablecoin
            .total_minted
            .checked_sub(stablecoin.total_burned)
            .ok_or(StablecoinError::MathOverflow)?;
        let new_circulating = circulating
            .checked_add(amount)
            .ok_or(StablecoinError::MathOverflow)?;
        require!(new_circulating <= stablecoin.max_supply, StablecoinError::SupplyCapExceeded);
    }

    // ── Epoch-aware per-minter quota enforcement (Feature 7) ────────
    let minter_info = &mut ctx.accounts.minter_info;
    let now = Clock::get()?.unix_timestamp;

    // Reset epoch counter if epoch has elapsed
    if minter_info.epoch_duration > 0
        && now >= minter_info.epoch_start + minter_info.epoch_duration
    {
        minter_info.minted_this_epoch = 0;
        minter_info.epoch_start = now;
    }

    // Choose the appropriate counter based on epoch mode
    let counter = if minter_info.epoch_duration > 0 {
        minter_info.minted_this_epoch
    } else {
        minter_info.minted_amount
    };

    let new_counter = counter
        .checked_add(amount)
        .ok_or(StablecoinError::MathOverflow)?;
    require!(new_counter <= minter_info.quota, StablecoinError::QuotaExceeded);

    // CPI: mint_to via stablecoin PDA (mint authority)
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[u8]] = &[STABLECOIN_SEED, mint_key.as_ref(), &[ctx.accounts.stablecoin.bump]];

    invoke_signed(
        &token_instruction::mint_to(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.mint.key(),
            &ctx.accounts.recipient_token_account.key(),
            &ctx.accounts.stablecoin.key(),
            &[],
            amount,
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.recipient_token_account.to_account_info(),
            ctx.accounts.stablecoin.to_account_info(),
        ],
        &[signer_seeds],
    )?;

    // Update quota tracking (always update both lifetime and epoch counters)
    minter_info.minted_amount = minter_info
        .minted_amount
        .checked_add(amount)
        .ok_or(StablecoinError::MathOverflow)?;
    minter_info.minted_this_epoch = minter_info
        .minted_this_epoch
        .checked_add(amount)
        .ok_or(StablecoinError::MathOverflow)?;

    // Update global stats
    let stablecoin = &mut ctx.accounts.stablecoin;
    stablecoin.total_minted = stablecoin
        .total_minted
        .checked_add(amount)
        .ok_or(StablecoinError::MathOverflow)?;

    emit!(TokensMinted {
        stablecoin: stablecoin.key(),
        minter: ctx.accounts.minter.key(),
        recipient: ctx.accounts.recipient_token_account.key(),
        amount,
        total_minted: stablecoin.total_minted,
        timestamp: now,
    });

    Ok(())
}
