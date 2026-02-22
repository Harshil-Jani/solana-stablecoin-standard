use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use spl_token_2022::{
    extension::ExtensionType,
    extension::default_account_state::instruction as default_state_ix,
    extension::transfer_hook::instruction as transfer_hook_ix,
    instruction as token_instruction,
};

use crate::state::*;
use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::StablecoinInitialized;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
    pub max_supply: u64,
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

    /// CHECK: Transfer hook program (pass system program ID if not using hooks)
    pub transfer_hook_program: AccountInfo<'info>,

    /// CHECK: Must be the Token-2022 program — prevents CPI redirection attacks
    #[account(address = spl_token_2022::ID)]
    pub token_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializeStablecoin>, params: InitializeParams) -> Result<()> {
    // ── 1. Validate input ──────────────────────────────────────────────
    require!(params.name.len() <= MAX_NAME_LEN, StablecoinError::NameTooLong);
    require!(params.symbol.len() <= MAX_SYMBOL_LEN, StablecoinError::SymbolTooLong);
    require!(params.uri.len() <= MAX_URI_LEN, StablecoinError::UriTooLong);

    // ── 2. Determine Token-2022 extensions ─────────────────────────────
    let mut extension_types = vec![ExtensionType::MintCloseAuthority];

    if params.enable_permanent_delegate {
        extension_types.push(ExtensionType::PermanentDelegate);
    }
    if params.enable_transfer_hook {
        extension_types.push(ExtensionType::TransferHook);
    }
    if params.default_account_frozen {
        extension_types.push(ExtensionType::DefaultAccountState);
    }

    // ── 3. Create the mint account with sufficient space ───────────────
    let mint_space = ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(
        &extension_types,
    )
    .map_err(|_| StablecoinError::MathOverflow)?;

    let rent = Rent::get()?;
    let mint_rent = rent.minimum_balance(mint_space);

    invoke(
        &anchor_lang::solana_program::system_instruction::create_account(
            &ctx.accounts.authority.key(),
            &ctx.accounts.mint.key(),
            mint_rent,
            mint_space as u64,
            &ctx.accounts.token_program.key(),
        ),
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.mint.to_account_info(),
        ],
    )?;

    // ── 4. Initialize extensions (BEFORE InitializeMint) ───────────────

    // MintCloseAuthority → stablecoin PDA can close the mint
    invoke(
        &token_instruction::initialize_mint_close_authority(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.mint.key(),
            Some(&ctx.accounts.stablecoin.key()),
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // PermanentDelegate → stablecoin PDA can seize tokens from any holder (SSS-2)
    if params.enable_permanent_delegate {
        invoke(
            &token_instruction::initialize_permanent_delegate(
                &ctx.accounts.token_program.key(),
                &ctx.accounts.mint.key(),
                &ctx.accounts.stablecoin.key(),
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // TransferHook → enforces blacklist check on every transfer (SSS-2)
    if params.enable_transfer_hook {
        invoke(
            &transfer_hook_ix::initialize(
                &ctx.accounts.token_program.key(),
                &ctx.accounts.mint.key(),
                Some(ctx.accounts.stablecoin.key()),
                Some(ctx.accounts.transfer_hook_program.key()),
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // DefaultAccountState → new token accounts start frozen (SSS-2)
    if params.default_account_frozen {
        invoke(
            &default_state_ix::initialize_default_account_state(
                &ctx.accounts.token_program.key(),
                &ctx.accounts.mint.key(),
                &spl_token_2022::state::AccountState::Frozen,
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // ── 5. Initialize the mint ─────────────────────────────────────────
    // Both mint authority and freeze authority are the stablecoin PDA,
    // ensuring all operations go through our program's RBAC checks.
    invoke(
        &token_instruction::initialize_mint2(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.mint.key(),
            &ctx.accounts.stablecoin.key(),
            Some(&ctx.accounts.stablecoin.key()),
            params.decimals,
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // ── 6. Populate StablecoinState PDA ────────────────────────────────
    let stablecoin = &mut ctx.accounts.stablecoin;
    stablecoin.authority = ctx.accounts.authority.key();
    stablecoin.mint = ctx.accounts.mint.key();
    stablecoin.name = params.name.clone();
    stablecoin.symbol = params.symbol.clone();
    stablecoin.uri = params.uri.clone();
    stablecoin.decimals = params.decimals;
    stablecoin.enable_permanent_delegate = params.enable_permanent_delegate;
    stablecoin.enable_transfer_hook = params.enable_transfer_hook;
    stablecoin.default_account_frozen = params.default_account_frozen;
    stablecoin.paused = false;
    stablecoin.total_minted = 0;
    stablecoin.total_burned = 0;
    stablecoin.max_supply = params.max_supply;
    stablecoin.bump = ctx.bumps.stablecoin;

    // ── 7. Grant all roles to the initializing authority ───────────────
    let role = &mut ctx.accounts.authority_role;
    role.stablecoin = stablecoin.key();
    role.holder = ctx.accounts.authority.key();
    role.roles = RoleFlags {
        is_minter: true,
        is_burner: true,
        is_pauser: true,
        is_blacklister: true,
        is_seizer: true,
    };
    role.bump = ctx.bumps.authority_role;

    // ── 8. Emit audit event ────────────────────────────────────────────
    emit!(StablecoinInitialized {
        stablecoin: stablecoin.key(),
        mint: ctx.accounts.mint.key(),
        authority: ctx.accounts.authority.key(),
        name: params.name,
        symbol: params.symbol,
        is_sss2: stablecoin.is_sss2(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
