use anchor_lang::prelude::*;

declare_id!("2D8s3bH6vD3LG7wqzvpSvYFysYoSK4wwggHCptaKFJJQ");

#[program]
pub mod sss_token {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
