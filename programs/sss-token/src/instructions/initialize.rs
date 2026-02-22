use anchor_lang::prelude::*;

use crate::state::*;
use crate::constants::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
}

#[derive(Accounts)]
#[instruction(params: InitializeParams)]
pub struct InitializeStablecoin<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = StablecoinState::LEN,
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    /// CHECK: Will be initialized as Token-2022 mint via CPI
    #[account(mut)]
    pub mint: Signer<'info>,

    /// The initial role account for the authority (gets all roles)
    #[account(
        init,
        payer = authority,
        space = RoleAccount::LEN,
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), authority.key().as_ref()],
        bump,
    )]
    pub authority_role: Account<'info, RoleAccount>,

    pub token_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(_ctx: Context<InitializeStablecoin>, _params: InitializeParams) -> Result<()> {
    // TODO: Implement in Commit 4
    Ok(())
}
