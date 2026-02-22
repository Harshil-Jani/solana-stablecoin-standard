use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use spl_token_2022::instruction as token_instruction;

use crate::state::*;
use crate::constants::*;
use crate::error::StablecoinError;

// ── Batch data types ──────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BatchMintItem {
    pub recipient_index: u8,
    pub amount: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BatchBlacklistItem {
    pub entry_index: u8,
    pub address_index: u8,
    pub reason: String,
}

// ── Batch Mint ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct BatchMint<'info> {
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

    /// CHECK: Must be the Token-2022 program
    #[account(address = spl_token_2022::ID)]
    pub token_program: AccountInfo<'info>,
    // remaining_accounts: recipient token accounts
}

pub fn batch_mint_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, BatchMint<'info>>,
    items: Vec<BatchMintItem>,
) -> Result<()> {
    require!(items.len() <= MAX_BATCH_SIZE, StablecoinError::BatchTooLarge);
    require!(!items.is_empty(), StablecoinError::ZeroAmount);
    require!(!ctx.accounts.stablecoin.paused, StablecoinError::Paused);
    require!(ctx.accounts.role.roles.is_minter, StablecoinError::Unauthorized);

    // Calculate total amount for quota check
    let mut total_amount: u64 = 0;
    for item in &items {
        require!(item.amount > 0, StablecoinError::ZeroAmount);
        total_amount = total_amount
            .checked_add(item.amount)
            .ok_or(StablecoinError::MathOverflow)?;
    }

    // Supply cap check
    let stablecoin = &ctx.accounts.stablecoin;
    if stablecoin.max_supply > 0 {
        let circulating = stablecoin
            .total_minted
            .checked_sub(stablecoin.total_burned)
            .ok_or(StablecoinError::MathOverflow)?;
        let new_circulating = circulating
            .checked_add(total_amount)
            .ok_or(StablecoinError::MathOverflow)?;
        require!(new_circulating <= stablecoin.max_supply, StablecoinError::SupplyCapExceeded);
    }

    // Epoch-aware quota check
    let minter_info = &mut ctx.accounts.minter_info;
    let now = Clock::get()?.unix_timestamp;
    if minter_info.epoch_duration > 0
        && now >= minter_info.epoch_start + minter_info.epoch_duration
    {
        minter_info.minted_this_epoch = 0;
        minter_info.epoch_start = now;
    }
    let counter = if minter_info.epoch_duration > 0 {
        minter_info.minted_this_epoch
    } else {
        minter_info.minted_amount
    };
    let new_counter = counter
        .checked_add(total_amount)
        .ok_or(StablecoinError::MathOverflow)?;
    require!(new_counter <= minter_info.quota, StablecoinError::QuotaExceeded);

    // CPI mint_to for each item
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[u8]] = &[STABLECOIN_SEED, mint_key.as_ref(), &[ctx.accounts.stablecoin.bump]];

    for item in &items {
        let recipient = &ctx.remaining_accounts[item.recipient_index as usize];
        invoke_signed(
            &token_instruction::mint_to(
                &ctx.accounts.token_program.key(),
                &ctx.accounts.mint.key(),
                &recipient.key(),
                &ctx.accounts.stablecoin.key(),
                &[],
                item.amount,
            )?,
            &[
                ctx.accounts.mint.to_account_info(),
                recipient.to_account_info(),
                ctx.accounts.stablecoin.to_account_info(),
            ],
            &[signer_seeds],
        )?;
    }

    // Update tracking
    minter_info.minted_amount = minter_info
        .minted_amount
        .checked_add(total_amount)
        .ok_or(StablecoinError::MathOverflow)?;
    minter_info.minted_this_epoch = minter_info
        .minted_this_epoch
        .checked_add(total_amount)
        .ok_or(StablecoinError::MathOverflow)?;

    let stablecoin = &mut ctx.accounts.stablecoin;
    stablecoin.total_minted = stablecoin
        .total_minted
        .checked_add(total_amount)
        .ok_or(StablecoinError::MathOverflow)?;

    Ok(())
}

// ── Batch Freeze ──────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct BatchFreeze<'info> {
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

    /// CHECK: Must be the Token-2022 program
    #[account(address = spl_token_2022::ID)]
    pub token_program: AccountInfo<'info>,
    // remaining_accounts: token accounts to freeze
}

pub fn batch_freeze_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, BatchFreeze<'info>>,
    indices: Vec<u8>,
) -> Result<()> {
    require!(indices.len() <= MAX_BATCH_SIZE, StablecoinError::BatchTooLarge);
    require!(!indices.is_empty(), StablecoinError::ZeroAmount);
    require!(ctx.accounts.role.roles.is_pauser, StablecoinError::Unauthorized);

    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[u8]] = &[STABLECOIN_SEED, mint_key.as_ref(), &[ctx.accounts.stablecoin.bump]];

    for idx in &indices {
        let target = &ctx.remaining_accounts[*idx as usize];
        invoke_signed(
            &token_instruction::freeze_account(
                &ctx.accounts.token_program.key(),
                &target.key(),
                &ctx.accounts.mint.key(),
                &ctx.accounts.stablecoin.key(),
                &[],
            )?,
            &[
                target.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.stablecoin.to_account_info(),
            ],
            &[signer_seeds],
        )?;
    }

    Ok(())
}

// ── Batch Blacklist ───────────────────────────────────────────────────

#[derive(Accounts)]
pub struct BatchBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), blacklister.key().as_ref()],
        bump = role.bump,
    )]
    pub role: Account<'info, RoleAccount>,

    pub system_program: Program<'info, System>,
    // remaining_accounts: alternating [blacklist_entry_pda, address] pairs
}

pub fn batch_blacklist_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, BatchBlacklist<'info>>,
    items: Vec<BatchBlacklistItem>,
) -> Result<()> {
    require!(items.len() <= MAX_BATCH_SIZE, StablecoinError::BatchTooLarge);
    require!(!items.is_empty(), StablecoinError::ZeroAmount);
    require!(ctx.accounts.stablecoin.is_sss2(), StablecoinError::ComplianceNotEnabled);
    require!(ctx.accounts.role.roles.is_blacklister, StablecoinError::Unauthorized);

    let stablecoin_key = ctx.accounts.stablecoin.key();
    let now = Clock::get()?.unix_timestamp;

    for item in &items {
        require!(item.reason.len() <= MAX_REASON_LEN, StablecoinError::ReasonTooLong);

        let entry_account = &ctx.remaining_accounts[item.entry_index as usize];
        let address_account = &ctx.remaining_accounts[item.address_index as usize];

        // Verify PDA derivation
        let (expected_pda, bump) = Pubkey::find_program_address(
            &[BLACKLIST_SEED, stablecoin_key.as_ref(), address_account.key().as_ref()],
            &crate::ID,
        );
        require!(entry_account.key() == expected_pda, StablecoinError::InvalidRoleConfig);

        // Create the blacklist entry PDA via system program CPI
        let space = BlacklistEntry::LEN;
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(space);

        invoke_signed(
            &anchor_lang::solana_program::system_instruction::create_account(
                &ctx.accounts.blacklister.key(),
                &entry_account.key(),
                lamports,
                space as u64,
                &crate::ID,
            ),
            &[
                ctx.accounts.blacklister.to_account_info(),
                entry_account.to_account_info(),
            ],
            &[&[BLACKLIST_SEED, stablecoin_key.as_ref(), address_account.key().as_ref(), &[bump]]],
        )?;

        // Manually serialize the BlacklistEntry into the account
        let mut data = entry_account.try_borrow_mut_data()?;
        // Write Anchor discriminator
        let disc = anchor_lang::solana_program::hash::hash(
            format!("account:BlacklistEntry").as_bytes()
        ).to_bytes();
        data[..8].copy_from_slice(&disc[..8]);

        let mut cursor = 8usize;
        // stablecoin: Pubkey
        data[cursor..cursor + 32].copy_from_slice(stablecoin_key.as_ref());
        cursor += 32;
        // address: Pubkey
        data[cursor..cursor + 32].copy_from_slice(address_account.key().as_ref());
        cursor += 32;
        // reason: String (4-byte len + data)
        let reason_bytes = item.reason.as_bytes();
        data[cursor..cursor + 4].copy_from_slice(&(reason_bytes.len() as u32).to_le_bytes());
        cursor += 4;
        data[cursor..cursor + reason_bytes.len()].copy_from_slice(reason_bytes);
        cursor += reason_bytes.len();
        // blacklisted_at: i64
        data[cursor..cursor + 8].copy_from_slice(&now.to_le_bytes());
        cursor += 8;
        // blacklisted_by: Pubkey
        data[cursor..cursor + 32].copy_from_slice(ctx.accounts.blacklister.key().as_ref());
        cursor += 32;
        // bump: u8
        data[cursor] = bump;
    }

    Ok(())
}
