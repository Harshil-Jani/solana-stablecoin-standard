use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    #[msg("Unauthorized: caller lacks required role")]
    Unauthorized,

    #[msg("Stablecoin is paused")]
    Paused,

    #[msg("Compliance module not enabled for this stablecoin")]
    ComplianceNotEnabled,

    #[msg("Address is already blacklisted")]
    AlreadyBlacklisted,

    #[msg("Address is not blacklisted")]
    NotBlacklisted,

    #[msg("Minter quota exceeded")]
    QuotaExceeded,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Name too long (max 32 characters)")]
    NameTooLong,

    #[msg("Symbol too long (max 10 characters)")]
    SymbolTooLong,

    #[msg("URI too long (max 200 characters)")]
    UriTooLong,

    #[msg("Reason too long (max 100 characters)")]
    ReasonTooLong,

    #[msg("Address is blacklisted")]
    Blacklisted,

    #[msg("Arithmetic overflow")]
    MathOverflow,

    #[msg("Invalid role configuration")]
    InvalidRoleConfig,

    // Feature 8: Supply cap
    #[msg("Supply cap exceeded")]
    SupplyCapExceeded,

    #[msg("New supply cap is below current circulating supply")]
    SupplyCapBelowCirculation,

    // Feature 9: Batch operations
    #[msg("Batch size exceeds maximum")]
    BatchTooLarge,

    // Feature 5: Multi-sig
    #[msg("Caller is not a multisig signer")]
    NotAMultisigSigner,

    #[msg("Signer has already approved this proposal")]
    AlreadyApproved,

    #[msg("Proposal has already been executed")]
    ProposalAlreadyExecuted,

    #[msg("Proposal has been cancelled")]
    ProposalCancelled,

    #[msg("Insufficient approvals to execute")]
    InsufficientApprovals,

    #[msg("Invalid threshold (must be > 0 and <= number of signers)")]
    InvalidThreshold,

    #[msg("Too many signers (max 10)")]
    TooManySigners,

    // Feature 6: Timelock
    #[msg("Timelock delay has not elapsed")]
    TimelockNotReady,

    #[msg("Timelock is not enabled")]
    TimelockNotEnabled,

    #[msg("Operation has already been executed")]
    OperationAlreadyExecuted,

    #[msg("Operation has been cancelled")]
    OperationCancelled,

    // Feature 10: Transfer limits
    #[msg("Transfer limit exceeded")]
    TransferLimitExceeded,
}
