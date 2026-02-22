use anchor_lang::prelude::*;

use crate::state::*;
use crate::constants::*;
use crate::events::{RolesUpdated, MinterUpdated};

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

pub fn update_roles_handler(ctx: Context<UpdateRoles>, roles: RoleFlags) -> Result<()> {
    let role = &mut ctx.accounts.role;
    role.stablecoin = ctx.accounts.stablecoin.key();
    role.holder = ctx.accounts.holder.key();
    role.roles = roles;
    role.bump = ctx.bumps.role;

    emit!(RolesUpdated {
        stablecoin: ctx.accounts.stablecoin.key(),
        holder: ctx.accounts.holder.key(),
        is_minter: roles.is_minter,
        is_burner: roles.is_burner,
        is_pauser: roles.is_pauser,
        is_blacklister: roles.is_blacklister,
        is_seizer: roles.is_seizer,
        updated_by: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

pub fn update_minter_handler(ctx: Context<UpdateMinter>, quota: u64) -> Result<()> {
    let minter_info = &mut ctx.accounts.minter_info;
    minter_info.stablecoin = ctx.accounts.stablecoin.key();
    minter_info.minter = ctx.accounts.minter.key();
    minter_info.quota = quota;
    // Preserve existing minted_amount (don't reset on quota update)
    minter_info.bump = ctx.bumps.minter_info;

    emit!(MinterUpdated {
        stablecoin: ctx.accounts.stablecoin.key(),
        minter: ctx.accounts.minter.key(),
        new_quota: quota,
        updated_by: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
