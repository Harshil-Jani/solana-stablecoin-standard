use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use spl_token_2022::{
    extension::StateWithExtensions,
    instruction as token_instruction,
    state::Account as SplAccount,
};

use crate::state::*;
use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::TokensSeized;

#[derive(Accounts)]
pub struct Seize<'info> {
    pub seizer: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), seizer.key().as_ref()],
        bump = role.bump,
    )]
    pub role: Account<'info, RoleAccount>,

    /// CHECK: Token-2022 mint
    pub mint: AccountInfo<'info>,

    /// CHECK: Source token account to seize from
    #[account(mut)]
    pub source_token_account: AccountInfo<'info>,

    /// CHECK: Destination treasury token account
    #[account(mut)]
    pub destination_token_account: AccountInfo<'info>,

    /// CHECK: Must be the Token-2022 program — prevents CPI redirection attacks
    #[account(address = spl_token_2022::ID)]
    pub token_program: AccountInfo<'info>,
}

pub fn handler(ctx: Context<Seize>) -> Result<()> {
    // Feature gate: only SSS-2 tokens support seizure
    require!(
        ctx.accounts.stablecoin.enable_permanent_delegate,
        StablecoinError::ComplianceNotEnabled
    );
    require!(ctx.accounts.role.roles.is_seizer, StablecoinError::Unauthorized);

    // Read full balance from source token account.
    // Must use StateWithExtensions (not Pack::unpack) because Token-2022 accounts
    // carry TLV extension data beyond the base 165-byte layout, and Pack::unpack
    // enforces a strict length == 165 check that always fails on Token-2022 accounts.
    let source_data = ctx.accounts.source_token_account.try_borrow_data()?;
    let source_account = StateWithExtensions::<SplAccount>::unpack(&source_data)?;
    let amount = source_account.base.amount;
    drop(source_data);

    require!(amount > 0, StablecoinError::ZeroAmount);

    // CPI: transfer_checked using permanent delegate authority (stablecoin PDA)
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[u8]] = &[
        STABLECOIN_SEED,
        mint_key.as_ref(),
        &[ctx.accounts.stablecoin.bump],
    ];

    invoke_signed(
        &token_instruction::transfer_checked(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.source_token_account.key(),
            &ctx.accounts.mint.key(),
            &ctx.accounts.destination_token_account.key(),
            &ctx.accounts.stablecoin.key(), // permanent delegate
            &[],
            amount,
            ctx.accounts.stablecoin.decimals,
        )?,
        &[
            ctx.accounts.source_token_account.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.destination_token_account.to_account_info(),
            ctx.accounts.stablecoin.to_account_info(),
        ],
        &[signer_seeds],
    )?;

    emit!(TokensSeized {
        stablecoin: ctx.accounts.stablecoin.key(),
        from: ctx.accounts.source_token_account.key(),
        to: ctx.accounts.destination_token_account.key(),
        amount,
        seized_by: ctx.accounts.seizer.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
