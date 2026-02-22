use anchor_lang::prelude::*;

use crate::state::*;
use crate::constants::*;

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

    /// CHECK: Token account to freeze/thaw
    #[account(mut)]
    pub target_token_account: AccountInfo<'info>,

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

    pub token_program: AccountInfo<'info>,
}

pub fn freeze_handler(_ctx: Context<FreezeTokenAccount>) -> Result<()> {
    // TODO: Implement in Commit 6
    Ok(())
}

pub fn thaw_handler(_ctx: Context<ThawTokenAccount>) -> Result<()> {
    // TODO: Implement in Commit 6
    Ok(())
}
