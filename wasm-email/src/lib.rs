use sha2::{Digest, Sha256};
use std::{ptr, slice, str};

const VERSION: u8 = 1;
const ERROR_MARKER: u8 = 0xff;
const NONCE_LEN: usize = 16;
const CONTEXT_MASK: &[u8] = b"OC/STAGE1/EMAIL/V1/MASK";
const CONTEXT_DIGEST: &[u8] = b"OC/STAGE1/EMAIL/V1/DIGEST";

const DISPOSABLE_DOMAINS: &[&str] = &[
    "10minutemail.com",
    "guerrillamail.com",
    "guerrillamail.net",
    "guerrillamail.org",
    "mailinator.com",
    "sharklasers.com",
    "grr.la",
    "yopmail.com",
    "trashmail.com",
    "tempmail.com",
    "temp-mail.org",
];

const JUNK_LOCAL_PARTS: &[&str] = &[
    "aaa", "aaaa", "aaaaa", "test", "testtest", "dummy", "sample", "qwerty",
    "asdf", "asdfgh", "zxcv", "zxcvbn",
];

#[no_mangle]
pub extern "C" fn alloc(len: u32) -> u32 {
    if len == 0 {
        return 0;
    }
    let boxed = vec![0u8; len as usize].into_boxed_slice();
    Box::into_raw(boxed) as *mut u8 as u32
}

#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: u32, len: u32) {
    if ptr == 0 || len == 0 {
        return;
    }
    let raw = ptr::slice_from_raw_parts_mut(ptr as *mut u8, len as usize);
    drop(Box::from_raw(raw));
}

#[no_mangle]
pub unsafe extern "C" fn process_email(
    input_ptr: u32,
    input_len: u32,
    nonce_ptr: u32,
    nonce_len: u32,
) -> u64 {
    if input_ptr == 0 || input_len == 0 {
        return return_buffer(error(1));
    }
    if nonce_ptr == 0 || nonce_len as usize != NONCE_LEN {
        return return_buffer(error(9));
    }

    let input = slice::from_raw_parts(input_ptr as *const u8, input_len as usize);
    let nonce = slice::from_raw_parts(nonce_ptr as *const u8, NONCE_LEN);

    let raw = match str::from_utf8(input) {
        Ok(value) => value,
        Err(_) => return return_buffer(error(3)),
    };

    let normalized = match normalize_and_validate(raw) {
        Ok(value) => value,
        Err(code) => return return_buffer(error(code)),
    };

    let bytes = normalized.as_bytes();
    let digest = digest_email(nonce, bytes);
    let masked = mask_email(nonce, bytes);

    let mut out = Vec::with_capacity(1 + 2 + NONCE_LEN + 32 + masked.len());
    out.push(VERSION);
    out.extend_from_slice(&(bytes.len() as u16).to_be_bytes());
    out.extend_from_slice(nonce);
    out.extend_from_slice(&digest);
    out.extend_from_slice(&masked);

    return_buffer(out)
}

fn normalize_and_validate(raw: &str) -> Result<String, u8> {
    let value = raw.trim();
    if value.is_empty() {
        return Err(1);
    }
    if value.as_bytes().len() > 254 {
        return Err(2);
    }
    if !value.is_ascii() {
        return Err(3);
    }

    let mut parts = value.split('@');
    let local = parts.next().unwrap_or_default();
    let domain = parts.next().unwrap_or_default();
    if parts.next().is_some() || local.is_empty() || domain.is_empty() {
        return Err(4);
    }
    if local.len() > 64 || !valid_local(local) {
        return Err(5);
    }

    let domain = domain.to_ascii_lowercase();
    if !valid_domain(&domain) {
        return Err(6);
    }
    if is_disposable(&domain) {
        return Err(7);
    }
    if is_junk_local(local) {
        return Err(8);
    }

    Ok(format!("{}@{}", local, domain))
}

fn valid_local(local: &str) -> bool {
    if local.starts_with('.') || local.ends_with('.') || local.contains("..") {
        return false;
    }
    local.bytes().all(|b| {
        b.is_ascii_alphanumeric()
            || matches!(
                b,
                b'!' | b'#' | b'$' | b'%' | b'&' | b'\'' | b'*' | b'+' | b'-' | b'/'
                    | b'=' | b'?' | b'^' | b'_' | b'`' | b'{' | b'|' | b'}' | b'~' | b'.'
            )
    })
}

fn valid_domain(domain: &str) -> bool {
    if domain.len() > 253 || !domain.contains('.') || domain.starts_with('.') || domain.ends_with('.') {
        return false;
    }

    let labels: Vec<&str> = domain.split('.').collect();
    if labels.len() < 2 {
        return false;
    }

    for label in &labels {
        if label.is_empty() || label.len() > 63 || label.starts_with('-') || label.ends_with('-') {
            return false;
        }
        if !label.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
            return false;
        }
    }

    let tld = labels.last().copied().unwrap_or_default();
    if tld.starts_with("xn--") {
        tld.len() > 4
    } else {
        tld.len() >= 2 && tld.bytes().all(|b| b.is_ascii_alphabetic())
    }
}

fn is_disposable(domain: &str) -> bool {
    DISPOSABLE_DOMAINS
        .iter()
        .any(|item| domain == *item || domain.ends_with(&format!(".{}", item)))
}

fn is_junk_local(local: &str) -> bool {
    let compact: String = local
        .chars()
        .filter(|c| !matches!(c, '.' | '_' | '+' | '-'))
        .flat_map(|c| c.to_lowercase())
        .collect();

    if compact.len() >= 3 {
        let mut chars = compact.chars();
        if let Some(first) = chars.next() {
            if chars.all(|c| c == first) {
                return true;
            }
        }
    }

    JUNK_LOCAL_PARTS.iter().any(|item| compact == *item)
}

fn digest_email(nonce: &[u8], email: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(CONTEXT_DIGEST);
    hasher.update(nonce);
    hasher.update(email);
    hasher.finalize().into()
}

fn mask_email(nonce: &[u8], email: &[u8]) -> Vec<u8> {
    let mut out = vec![0u8; email.len()];
    let mut offset = 0usize;
    let mut counter = 0u32;

    while offset < email.len() {
        let mut hasher = Sha256::new();
        hasher.update(CONTEXT_MASK);
        hasher.update(nonce);
        hasher.update(counter.to_be_bytes());
        let block = hasher.finalize();

        for &key in block.iter() {
            if offset >= email.len() {
                break;
            }
            out[offset] = email[offset] ^ key;
            offset += 1;
        }
        counter = counter.wrapping_add(1);
    }

    out
}

fn error(code: u8) -> Vec<u8> {
    vec![ERROR_MARKER, code]
}

fn return_buffer(out: Vec<u8>) -> u64 {
    let len = out.len() as u32;
    if len == 0 {
        return 0;
    }
    let boxed = out.into_boxed_slice();
    let ptr = Box::into_raw(boxed) as *mut u8 as u32;
    ((len as u64) << 32) | ptr as u64
}
