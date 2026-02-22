use anchor_lang::prelude::*;

use crate::state::*;
use crate::constants::*;
use crate::error::StablecoinError;

#[derive(Accounts)]
pub struct UpdateSupplyCap<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        constraint = stablecoin.authority == authority.key(),
    )]
    pub stablecoin: Account<'info, StablecoinState>,
}

pub fn update_supply_cap_handler(ctx: Context<UpdateSupplyCap>, new_max_supply: u64) -> Result<()> {
    let stablecoin = &mut ctx.accounts.stablecoin;

    // If setting a non-zero cap, ensure it's >= current circulating supply
    if new_max_supply > 0 {
        let circulating = stablecoin
            .total_minted
            .checked_sub(stablecoin.total_burned)
            .ok_or(StablecoinError::MathOverflow)?;
        require!(
            new_max_supply >= circulating,
            StablecoinError::SupplyCapBelowCirculation
        );
    }

    stablecoin.max_supply = new_max_supply;

    Ok(())
}
