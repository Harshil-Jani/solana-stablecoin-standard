use anchor_lang::prelude::*;

use crate::state::*;
use crate::constants::*;

#[derive(Accounts)]
pub struct UpdateRoles<'info> {
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
        space = RoleAccount::LEN,
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), holder.key().as_ref()],
        bump,
    )]
    pub role: Account<'info, RoleAccount>,

    /// CHECK: The account receiving role assignment
    pub holder: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateMinter<'info> {
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
        space = MinterInfo::LEN,
        seeds = [MINTER_SEED, stablecoin.key().as_ref(), minter.key().as_ref()],
        bump,
    )]
    pub minter_info: Account<'info, MinterInfo>,

    /// CHECK: The minter account
    pub minter: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn update_roles_handler(_ctx: Context<UpdateRoles>, _roles: RoleFlags) -> Result<()> {
    // TODO: Implement in Commit 5
    Ok(())
}

pub fn update_minter_handler(_ctx: Context<UpdateMinter>, _quota: u64) -> Result<()> {
    // TODO: Implement in Commit 5
    Ok(())
}
