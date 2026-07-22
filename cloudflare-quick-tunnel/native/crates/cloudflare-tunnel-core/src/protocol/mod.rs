pub(crate) mod headers;
pub(crate) mod model;
pub(crate) mod rpc;

#[cfg(test)]
mod asset_tests {
    use sha2::{Digest, Sha256};

    fn hash(bytes: &[u8]) -> String {
        format!("{:X}", Sha256::digest(bytes))
    }

    #[test]
    fn pinned_cloudflared_assets_have_reviewed_hashes() {
        assert_eq!(
            hash(include_bytes!(
                "../../third_party/cloudflared/schemas/tunnelrpc.capnp"
            )),
            "448AA30F4E251DC8810ABA1A16C60EBEAAA5E000F88C46A8A28BA29F73E3BC3C"
        );
        assert_eq!(
            hash(include_bytes!(
                "../../third_party/cloudflared/schemas/go.capnp"
            )),
            "E6723446565E5D8CBBC97FBB6123E0E3283ADE1E3EC5884D879A0F78DF16F8C1"
        );
        assert_eq!(
            hash(include_bytes!(
                "../../third_party/cloudflared/cf-edge-roots.pem"
            )),
            "02D22CCD469A66DCE563FDA77084593CCD5016E47468B873E073D58B033D5FCE"
        );
        assert_eq!(
            hash(include_bytes!("generated/tunnelrpc_capnp.rs")),
            "B9F464268F6F169568B5B48796283F115ED173C3A5C400ED21B2850E88AD53C1"
        );
    }
}
