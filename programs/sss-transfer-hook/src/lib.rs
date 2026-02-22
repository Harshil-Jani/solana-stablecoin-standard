use anchor_lang::prelude::*;

declare_id!("F2of7agMFET8v3verXe3e6Hmfd71t833RjPxEjs5wRdd");

#[program]
pub mod sss_transfer_hook {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
