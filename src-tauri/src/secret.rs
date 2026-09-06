//! Credential encryption at rest via Windows DPAPI (user scope). The blob only
//! decrypts for the same Windows user on the same machine.

#[cfg(windows)]
mod imp {
    use base64::engine::general_purpose::STANDARD as B64;
    use base64::Engine as _;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    /// Optional entropy mixed into every blob. Not a secret, the source is
    /// public. It stops generic DPAPI tools reading the blob without it.
    const ENTROPY: &[u8] = b"Hexvault-v1";
    const DESCRIPTION: &str = "Hexvault credentials";

    fn blob(bytes: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB { cbData: bytes.len() as u32, pbData: bytes.as_ptr() as *mut u8 }
    }

    /// Copy a DPAPI output blob out and hand its memory back to Windows.
    ///
    /// # Safety
    /// `out` must be a blob filled in by a successful DPAPI call.
    unsafe fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
        if out.pbData.is_null() {
            return Vec::new();
        }
        let bytes = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(out.pbData as *mut core::ffi::c_void)));
        bytes
    }

    pub fn protect(plain: &str) -> Result<String, String> {
        if plain.is_empty() {
            return Ok(String::new());
        }
        let description: Vec<u16> =
            DESCRIPTION.encode_utf16().chain(std::iter::once(0)).collect();
        let input = blob(plain.as_bytes());
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB::default();

        let bytes = unsafe {
            CryptProtectData(
                &input,
                PCWSTR(description.as_ptr()),
                Some(&entropy),
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
            .map_err(|e| format!("encrypting credential: {e}"))?;
            take(out)
        };
        Ok(B64.encode(bytes))
    }

    pub fn unprotect(encoded: &str) -> Result<String, String> {
        if encoded.is_empty() {
            return Ok(String::new());
        }
        let raw = B64.decode(encoded).map_err(|e| format!("decoding credential: {e}"))?;
        let input = blob(&raw);
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB::default();

        let bytes = unsafe {
            CryptUnprotectData(
                &input,
                None,
                Some(&entropy),
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
            .map_err(|e| format!("decrypting credential: {e}"))?;
            take(out)
        };
        String::from_utf8(bytes)
            .map_err(|_| "decrypted credential was not valid UTF-8".to_string())
    }
}

#[cfg(not(windows))]
mod imp {
    const UNSUPPORTED: &str = "credential encryption is only supported on Windows";

    pub fn protect(_plain: &str) -> Result<String, String> {
        Err(UNSUPPORTED.to_string())
    }

    pub fn unprotect(_encoded: &str) -> Result<String, String> {
        Err(UNSUPPORTED.to_string())
    }
}

/// Encrypt to a base64 DPAPI blob. The empty string maps to the empty string.
pub fn protect(plain: &str) -> Result<String, String> {
    imp::protect(plain)
}

/// Decrypt a base64 DPAPI blob. `Err` on bad base64, a DPAPI failure, or
/// non-UTF-8 plaintext.
pub fn unprotect(encoded: &str) -> Result<String, String> {
    imp::unprotect(encoded)
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn round_trips_a_plain_string() {
        let blob = protect("hunter2").unwrap();
        assert_ne!(blob, "hunter2");
        assert_eq!(unprotect(&blob).unwrap(), "hunter2");
    }

    #[test]
    fn round_trips_unicode() {
        let secret = "pa\u{00DF}wort \u{1F510} \u{4F60}\u{597D}";
        let blob = protect(secret).unwrap();
        assert_eq!(unprotect(&blob).unwrap(), secret);
    }

    #[test]
    fn round_trips_the_empty_string() {
        assert_eq!(protect("").unwrap(), "");
        assert_eq!(unprotect("").unwrap(), "");
    }

    #[test]
    fn rejects_garbage_base64() {
        assert!(unprotect("not base64 !!!").is_err());
    }

    #[test]
    fn rejects_a_tampered_blob() {
        use base64::engine::general_purpose::STANDARD as B64;
        use base64::Engine as _;

        let blob = protect("hunter2").unwrap();
        let mut raw = B64.decode(&blob).unwrap();
        let last = raw.len() - 1;
        raw[last] ^= 0xFF;
        assert!(unprotect(&B64.encode(raw)).is_err());
    }

    #[test]
    fn ciphertext_is_randomized() {
        assert_ne!(protect("hunter2").unwrap(), protect("hunter2").unwrap());
    }
}
