use anchor_lang::prelude::*;

use crate::state::*;
use crate::constants::*;
use crate::error::StablecoinError;

// ── Create Multisig ───────────────────────────────────────────────────

#[derive(Accounts)]
pub struct CreateMultisig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        constraint = stablecoin.authority == authority.key(),
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        init,
        payer = authority,
        space = MultisigConfig::LEN,
        seeds = [MULTISIG_SEED, stablecoin.key().as_ref()],
        bump,
    )]
    pub multisig: Account<'info, MultisigConfig>,

    pub system_program: Program<'info, System>,
}

pub fn create_multisig_handler(
    ctx: Context<CreateMultisig>,
    signers: Vec<Pubkey>,
    threshold: u8,
) -> Result<()> {
    require!(
        !signers.is_empty() && signers.len() <= MultisigConfig::MAX_SIGNERS,
        StablecoinError::TooManySigners
    );
    require!(
        threshold > 0 && (threshold as usize) <= signers.len(),
        StablecoinError::InvalidThreshold
    );

    let multisig = &mut ctx.accounts.multisig;
    multisig.stablecoin = ctx.accounts.stablecoin.key();
    multisig.signers = signers;
    multisig.threshold = threshold;
    multisig.proposal_count = 0;
    multisig.bump = ctx.bumps.multisig;

    Ok(())
}

// ── Create Proposal ───────────────────────────────────────────────────

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        mut,
        seeds = [MULTISIG_SEED, stablecoin.key().as_ref()],
        bump = multisig.bump,
    )]
    pub multisig: Account<'info, MultisigConfig>,

    #[account(
        init,
        payer = proposer,
        space = Proposal::LEN,
        seeds = [PROPOSAL_SEED, stablecoin.key().as_ref(), &multisig.proposal_count.to_le_bytes()],
        bump,
    )]
    pub proposal: Account<'info, Proposal>,

    pub system_program: Program<'info, System>,
}

pub fn create_proposal_handler(
    ctx: Context<CreateProposal>,
    instruction_type: InstructionType,
    data: Vec<u8>,
) -> Result<()> {
    let multisig = &ctx.accounts.multisig;

    // Verify proposer is a signer
    let proposer_key = ctx.accounts.proposer.key();
    let signer_index = multisig
        .signers
        .iter()
        .position(|s| *s == proposer_key)
        .ok_or(StablecoinError::NotAMultisigSigner)?;

    require!(data.len() <= Proposal::MAX_DATA_LEN, StablecoinError::MathOverflow);

    // Initialize approval flags
    let mut approvals = vec![false; multisig.signers.len()];
    approvals[signer_index] = true; // Auto-approve for proposer

    let proposal = &mut ctx.accounts.proposal;
    proposal.stablecoin = ctx.accounts.stablecoin.key();
    proposal.proposal_id = multisig.proposal_count;
    proposal.proposer = proposer_key;
    proposal.instruction_type = instruction_type;
    proposal.data = data;
    proposal.approvals = approvals;
    proposal.approval_count = 1;
    proposal.executed = false;
    proposal.cancelled = false;
    proposal.created_at = Clock::get()?.unix_timestamp;
    proposal.bump = ctx.bumps.proposal;

    // Increment proposal counter
    let multisig = &mut ctx.accounts.multisig;
    multisig.proposal_count = multisig
        .proposal_count
        .checked_add(1)
        .ok_or(StablecoinError::MathOverflow)?;

    Ok(())
}

// ── Approve Proposal ──────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct ApproveProposal<'info> {
    pub signer: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [MULTISIG_SEED, stablecoin.key().as_ref()],
        bump = multisig.bump,
    )]
    pub multisig: Account<'info, MultisigConfig>,

    #[account(
        mut,
        seeds = [PROPOSAL_SEED, stablecoin.key().as_ref(), &proposal_id.to_le_bytes()],
        bump = proposal.bump,
    )]
    pub proposal: Account<'info, Proposal>,
}

pub fn approve_proposal_handler(ctx: Context<ApproveProposal>, _proposal_id: u64) -> Result<()> {
    let proposal = &mut ctx.accounts.proposal;
    require!(!proposal.executed, StablecoinError::ProposalAlreadyExecuted);
    require!(!proposal.cancelled, StablecoinError::ProposalCancelled);

    let signer_key = ctx.accounts.signer.key();
    let signer_index = ctx
        .accounts
        .multisig
        .signers
        .iter()
        .position(|s| *s == signer_key)
        .ok_or(StablecoinError::NotAMultisigSigner)?;

    require!(!proposal.approvals[signer_index], StablecoinError::AlreadyApproved);

    proposal.approvals[signer_index] = true;
    proposal.approval_count = proposal
        .approval_count
        .checked_add(1)
        .ok_or(StablecoinError::MathOverflow)?;

    Ok(())
}

// ── Execute Proposal ──────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct ExecuteProposal<'info> {
    #[account(mut)]
    pub executor: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [MULTISIG_SEED, stablecoin.key().as_ref()],
        bump = multisig.bump,
    )]
    pub multisig: Account<'info, MultisigConfig>,

    #[account(
        mut,
        seeds = [PROPOSAL_SEED, stablecoin.key().as_ref(), &proposal_id.to_le_bytes()],
        bump = proposal.bump,
    )]
    pub proposal: Account<'info, Proposal>,
}

pub fn execute_proposal_handler(ctx: Context<ExecuteProposal>, _proposal_id: u64) -> Result<()> {
    let proposal = &mut ctx.accounts.proposal;
    require!(!proposal.executed, StablecoinError::ProposalAlreadyExecuted);
    require!(!proposal.cancelled, StablecoinError::ProposalCancelled);
    require!(
        proposal.approval_count >= ctx.accounts.multisig.threshold,
        StablecoinError::InsufficientApprovals
    );

    // Execute the proposed operation based on instruction_type
    let stablecoin = &mut ctx.accounts.stablecoin;
    match proposal.instruction_type {
        InstructionType::Pause => {
            stablecoin.paused = true;
        }
        InstructionType::Unpause => {
            stablecoin.paused = false;
        }
        InstructionType::UpdateSupplyCap => {
            if proposal.data.len() >= 8 {
                let new_cap = u64::from_le_bytes(
                    proposal.data[..8].try_into().unwrap()
                );
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
            if proposal.data.len() >= 32 {
                let new_authority = Pubkey::try_from(&proposal.data[..32])
                    .map_err(|_| StablecoinError::InvalidRoleConfig)?;
                stablecoin.authority = new_authority;
            }
        }
        // Other instruction types require additional accounts (remaining_accounts)
        // and are left as record-only for this version
        _ => {}
    }

    proposal.executed = true;

    Ok(())
}
