use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;
use state::{RoleFlags, InstructionType};

declare_id!("2D8s3bH6vD3LG7wqzvpSvYFysYoSK4wwggHCptaKFJJQ");

#[program]
pub mod sss_token {
    use super::*;

    // === Core Instructions (all presets) ===

    pub fn initialize(ctx: Context<InitializeStablecoin>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint::handler(ctx, amount)
    }

    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn::handler(ctx, amount)
    }

    pub fn freeze_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        instructions::freeze::freeze_handler(ctx)
    }

    pub fn thaw_account(ctx: Context<ThawTokenAccount>) -> Result<()> {
        instructions::freeze::thaw_handler(ctx)
    }

    pub fn pause(ctx: Context<PauseUnpause>) -> Result<()> {
        instructions::pause::pause_handler(ctx)
    }

    pub fn unpause(ctx: Context<PauseUnpause>) -> Result<()> {
        instructions::pause::unpause_handler(ctx)
    }

    pub fn update_roles(ctx: Context<UpdateRoles>, roles: RoleFlags) -> Result<()> {
        instructions::roles::update_roles_handler(ctx, roles)
    }

    pub fn update_minter(ctx: Context<UpdateMinter>, quota: u64, epoch_duration: Option<i64>) -> Result<()> {
        instructions::roles::update_minter_handler(ctx, quota, epoch_duration)
    }

    pub fn transfer_authority(ctx: Context<TransferAuthority>) -> Result<()> {
        instructions::authority::handler(ctx)
    }

    // === SSS-2 Compliance Instructions ===

    pub fn add_to_blacklist(ctx: Context<AddToBlacklist>, reason: String) -> Result<()> {
        instructions::blacklist::add_handler(ctx, reason)
    }

    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
        instructions::blacklist::remove_handler(ctx)
    }

    pub fn seize(ctx: Context<Seize>) -> Result<()> {
        instructions::seize::handler(ctx)
    }

    // === Feature 8: Supply Cap ===

    pub fn update_supply_cap(ctx: Context<UpdateSupplyCap>, new_max_supply: u64) -> Result<()> {
        instructions::supply_cap::update_supply_cap_handler(ctx, new_max_supply)
    }

    // === Feature 9: Batch Operations ===

    pub fn batch_mint<'info>(
        ctx: Context<'_, '_, '_, 'info, BatchMint<'info>>,
        items: Vec<BatchMintItem>,
    ) -> Result<()> {
        instructions::batch::batch_mint_handler(ctx, items)
    }

    pub fn batch_freeze<'info>(
        ctx: Context<'_, '_, '_, 'info, BatchFreeze<'info>>,
        indices: Vec<u8>,
    ) -> Result<()> {
        instructions::batch::batch_freeze_handler(ctx, indices)
    }

    pub fn batch_blacklist<'info>(
        ctx: Context<'_, '_, '_, 'info, BatchBlacklist<'info>>,
        items: Vec<BatchBlacklistItem>,
    ) -> Result<()> {
        instructions::batch::batch_blacklist_handler(ctx, items)
    }

    // === Feature 5: Multi-sig Authority ===

    pub fn create_multisig(ctx: Context<CreateMultisig>, signers: Vec<Pubkey>, threshold: u8) -> Result<()> {
        instructions::multisig::create_multisig_handler(ctx, signers, threshold)
    }

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        instruction_type: InstructionType,
        data: Vec<u8>,
    ) -> Result<()> {
        instructions::multisig::create_proposal_handler(ctx, instruction_type, data)
    }

    pub fn approve_proposal(ctx: Context<ApproveProposal>, proposal_id: u64) -> Result<()> {
        instructions::multisig::approve_proposal_handler(ctx, proposal_id)
    }

    pub fn execute_proposal(ctx: Context<ExecuteProposal>, proposal_id: u64) -> Result<()> {
        instructions::multisig::execute_proposal_handler(ctx, proposal_id)
    }

    // === Feature 6: Time-locked Operations ===

    pub fn configure_timelock(ctx: Context<ConfigureTimelock>, delay: i64, enabled: bool) -> Result<()> {
        instructions::timelock::configure_timelock_handler(ctx, delay, enabled)
    }

    pub fn propose_timelocked(
        ctx: Context<ProposeTimelockedV2>,
        op_id: u64,
        op_type: InstructionType,
        data: Vec<u8>,
    ) -> Result<()> {
        instructions::timelock::propose_timelocked_handler(ctx, op_id, op_type, data)
    }

    pub fn execute_timelocked(ctx: Context<ExecuteTimelocked>, op_id: u64) -> Result<()> {
        instructions::timelock::execute_timelocked_handler(ctx, op_id)
    }

    pub fn cancel_timelocked(ctx: Context<CancelTimelocked>, op_id: u64) -> Result<()> {
        instructions::timelock::cancel_timelocked_handler(ctx, op_id)
    }

    // === Feature 10: Transfer Limits ===

    pub fn configure_transfer_limits(ctx: Context<ConfigureTransferLimits>, max_per_tx: u64, max_per_day: u64) -> Result<()> {
        instructions::transfer_limits::configure_transfer_limits_handler(ctx, max_per_tx, max_per_day)
    }
}
