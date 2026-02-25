use anchor_lang::prelude::*;

use crate::state::*;
use crate::constants::*;
use crate::error::StablecoinError;

// ── Configure Timelock ────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ConfigureTimelock<'info> {
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
        space = TimelockConfig::LEN,
        seeds = [TIMELOCK_CONFIG_SEED, stablecoin.key().as_ref()],
        bump,
    )]
    pub timelock_config: Account<'info, TimelockConfig>,

    pub system_program: Program<'info, System>,
}

/// Configure timelock parameters (authority-only).
pub fn configure_timelock_handler(
    ctx: Context<ConfigureTimelock>,
    delay: i64,
    enabled: bool,
) -> Result<()> {
    require!(delay >= 0, StablecoinError::InvalidTimelockDelay);

    let config = &mut ctx.accounts.timelock_config;
    config.stablecoin = ctx.accounts.stablecoin.key();
    config.delay = delay;
    config.enabled = enabled;
    config.bump = ctx.bumps.timelock_config;

    emit!(crate::events::TimelockConfigured {
        stablecoin: ctx.accounts.stablecoin.key(),
        delay,
        enabled,
        configured_by: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ── Propose Timelocked ────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(op_id: u64)]
pub struct ProposeTimelockedV2<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        constraint = stablecoin.authority == authority.key(),
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [TIMELOCK_CONFIG_SEED, stablecoin.key().as_ref()],
        bump = timelock_config.bump,
    )]
    pub timelock_config: Account<'info, TimelockConfig>,

    #[account(
        init,
        payer = authority,
        space = TimelockOperation::LEN,
        seeds = [TIMELOCK_SEED, stablecoin.key().as_ref(), &op_id.to_le_bytes()],
        bump,
    )]
    pub timelock_op: Account<'info, TimelockOperation>,

    pub system_program: Program<'info, System>,
}

/// Propose a timelocked operation (authority-only).
pub fn propose_timelocked_handler(
    ctx: Context<ProposeTimelockedV2>,
    op_id: u64,
    op_type: InstructionType,
    data: Vec<u8>,
) -> Result<()> {
    require!(ctx.accounts.timelock_config.enabled, StablecoinError::TimelockNotEnabled);
    require!(data.len() <= TimelockOperation::MAX_DATA_LEN, StablecoinError::MathOverflow);

    let now = Clock::get()?.unix_timestamp;
    let eta = now + ctx.accounts.timelock_config.delay;

    let op = &mut ctx.accounts.timelock_op;
    op.stablecoin = ctx.accounts.stablecoin.key();
    op.op_id = op_id;
    op.op_type = op_type;
    op.data = data;
    op.eta = eta;
    op.proposer = ctx.accounts.authority.key();
    op.executed = false;
    op.cancelled = false;
    op.bump = ctx.bumps.timelock_op;

    emit!(crate::events::TimelockProposed {
        stablecoin: ctx.accounts.stablecoin.key(),
        op_id,
        op_type,
        eta,
        proposer: ctx.accounts.authority.key(),
        timestamp: now,
    });

    Ok(())
}

// ── Execute Timelocked ────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(op_id: u64)]
pub struct ExecuteTimelocked<'info> {
    /// Executor must be the stablecoin authority.
    pub executor: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        constraint = stablecoin.authority == executor.key() @ StablecoinError::Unauthorized,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        mut,
        seeds = [TIMELOCK_SEED, stablecoin.key().as_ref(), &op_id.to_le_bytes()],
        bump = timelock_op.bump,
    )]
    pub timelock_op: Account<'info, TimelockOperation>,
}

/// Execute a timelocked operation after its delay has elapsed (authority-only).
pub fn execute_timelocked_handler(ctx: Context<ExecuteTimelocked>, _op_id: u64) -> Result<()> {
    let op = &mut ctx.accounts.timelock_op;
    require!(!op.executed, StablecoinError::OperationAlreadyExecuted);
    require!(!op.cancelled, StablecoinError::OperationCancelled);

    let now = Clock::get()?.unix_timestamp;
    require!(now >= op.eta, StablecoinError::TimelockNotReady);

    // Execute the operation
    let stablecoin = &mut ctx.accounts.stablecoin;
    match op.op_type {
        InstructionType::Pause => {
            stablecoin.paused = true;
        }
        InstructionType::Unpause => {
            stablecoin.paused = false;
        }
        InstructionType::UpdateSupplyCap => {
            if op.data.len() >= 8 {
                let new_cap = u64::from_le_bytes(op.data[..8].try_into().unwrap());
                if new_cap > 0 {
                    let circulating = stablecoin
                        .total_minted
                        .checked_sub(stablecoin.total_burned)
                        .ok_or(StablecoinError::MathOverflow)?;
                    require!(
                        new_cap >= circulating,
                        StablecoinError::SupplyCapBelowCirculation
                    );
                }
                stablecoin.max_supply = new_cap;
            }
        }
        InstructionType::TransferAuthority => {
            if op.data.len() >= 32 {
                let new_authority = Pubkey::try_from(&op.data[..32])
                    .map_err(|_| StablecoinError::InvalidRoleConfig)?;
                stablecoin.pending_authority = Some(new_authority);
            }
        }
        // Other instruction types require additional accounts (remaining_accounts)
        // and are recorded for off-chain indexers to process
        _ => {}
    }

    op.executed = true;

    emit!(crate::events::TimelockExecuted {
        stablecoin: ctx.accounts.stablecoin.key(),
        op_id: op.op_id,
        executor: ctx.accounts.executor.key(),
        timestamp: now,
    });

    Ok(())
}

// ── Cancel Timelocked ─────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(op_id: u64)]
pub struct CancelTimelocked<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        constraint = stablecoin.authority == authority.key(),
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        mut,
        seeds = [TIMELOCK_SEED, stablecoin.key().as_ref(), &op_id.to_le_bytes()],
        bump = timelock_op.bump,
    )]
    pub timelock_op: Account<'info, TimelockOperation>,
}

/// Cancel a pending timelocked operation (authority-only).
pub fn cancel_timelocked_handler(ctx: Context<CancelTimelocked>, _op_id: u64) -> Result<()> {
    let op = &mut ctx.accounts.timelock_op;
    require!(!op.executed, StablecoinError::OperationAlreadyExecuted);
    require!(!op.cancelled, StablecoinError::OperationCancelled);

    op.cancelled = true;

    emit!(crate::events::TimelockCancelled {
        stablecoin: ctx.accounts.stablecoin.key(),
        op_id: op.op_id,
        cancelled_by: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
