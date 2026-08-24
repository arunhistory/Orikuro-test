use base64ct::{Base64UrlUnpadded, Encoding};
use rand_core::{CryptoRng, Error as RandError, RngCore};
use rsa::{BigUint, Oaep, RsaPublicKey};
use sha2::Sha256;
use std::{ptr, slice, str};

const VERSION: u8 = 3;
const ERROR_MARKER: u8 = 0xff;
const A_KID: &str = "gnqyOhhA_YngD8NGD-uJjxQD6H9x3VRaTn7vY6vw02c";
const A_N_B64U: &str = "wDNvnSNpLWzrS7VoD2Lz4t-e6Ktg5CauInDV2LeX0UE0kIt3hXgySRdQ9Yt5P5RfdA2nOYrTUKqYrx1AxiDNbkWDQuBWmz4uEe9jfhlKRpz4DcV3IxGYmjpVQrGFe8iJ5BVDKdRoPyjaHN8x7RnZoOOwJOqbxSbLKBEFswPIl5T5VDe-W9CaQ7kFwF3l0aB3tEGztkoHs5pKHRSJEuGIIBc4QJ0CVBqVvdrTbLOVvj1zc7FdTzcqFMuE22nkXiZKdBZTEb9mkXtTNFasR_8tAzZCBcs3aEo_99JevFlNKXMxlXyfMx4d9vDK_WW8ax6gCjH0W3SpGSI__RtFAZWcAmnXilGPmXm3AUcoQEfa1UgUqZkoZQ-j2AGUPppG9arMgI6fME7r1WtxHAJc_rNKBAPNXoajGTXT0Z5GEZoMkGWucAw7NwLePQLrBzC62MSHgfIA2Ji2F_u4kYyJKq4wsCQ_RSUaiI0L6Jz9y8m7l8D5yLcckOJtYDJV2f8";
const A_E: u32 = 65537;

const DISPOSABLE_DOMAINS: &[&str] = &[
    "10minutemail.com","guerrillamail.com","guerrillamail.net","guerrillamail.org",
    "mailinator.com","sharklasers.com","grr.la","yopmail.com","trashmail.com",
    "tempmail.com","temp-mail.org",
];
const JUNK_LOCAL_PARTS: &[&str] = &[
    "aaa","aaaa","aaaaa","test","testtest","dummy","sample","qwerty",
    "asdf","asdfgh","zxcv","zxcvbn",
];

#[link(wasm_import_module = "env")]
extern "C" { fn oc_random_fill(ptr: u32, len: u32) -> i32; }

struct OcRng;
impl RngCore for OcRng {
    fn next_u32(&mut self) -> u32 { let mut b=[0u8;4]; self.fill_bytes(&mut b); u32::from_le_bytes(b) }
    fn next_u64(&mut self) -> u64 { let mut b=[0u8;8]; self.fill_bytes(&mut b); u64::from_le_bytes(b) }
    fn fill_bytes(&mut self, dest: &mut [u8]) { self.try_fill_bytes(dest).expect("secure random unavailable") }
    fn try_fill_bytes(&mut self, dest: &mut [u8]) -> Result<(), RandError> {
        if dest.is_empty() { return Ok(()); }
        let rc=unsafe{oc_random_fill(dest.as_mut_ptr() as u32,dest.len() as u32)};
        if rc==0 {Ok(())} else {Err(RandError::new("secure random unavailable"))}
    }
}
impl CryptoRng for OcRng {}

#[no_mangle]
pub extern "C" fn alloc(len:u32)->u32 {
    if len==0{return 0;}
    Box::into_raw(vec![0u8;len as usize].into_boxed_slice()) as *mut u8 as u32
}
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr:u32,len:u32) {
    if ptr==0||len==0{return;}
    drop(Box::from_raw(ptr::slice_from_raw_parts_mut(ptr as *mut u8,len as usize)));
}

#[no_mangle]
pub unsafe extern "C" fn process_email(input_ptr:u32,input_len:u32)->u64 {
    if input_ptr==0||input_len==0{return return_buffer(error(1));}
    let input=slice::from_raw_parts(input_ptr as *const u8,input_len as usize);
    let raw=match str::from_utf8(input){Ok(v)=>v,Err(_)=>return return_buffer(error(3))};
    let normalized=match normalize_and_validate(raw){Ok(v)=>v,Err(c)=>return return_buffer(error(c))};
    let n=match Base64UrlUnpadded::decode_vec(A_N_B64U){Ok(v)=>v,Err(_)=>return return_buffer(error(10))};
    let public=match RsaPublicKey::new(BigUint::from_bytes_be(&n),BigUint::from(A_E)){Ok(v)=>v,Err(_)=>return return_buffer(error(10))};
    let mut rng=OcRng;
    let encrypted=match public.encrypt(&mut rng,Oaep::new::<Sha256>(),normalized.as_bytes()) {
        Ok(v)=>v,Err(_)=>return return_buffer(error(11))
    };
    let kid=A_KID.as_bytes();
    let mut out=Vec::with_capacity(1+1+kid.len()+2+encrypted.len());
    out.push(VERSION);
    out.push(kid.len() as u8);
    out.extend_from_slice(kid);
    out.extend_from_slice(&(encrypted.len() as u16).to_be_bytes());
    out.extend_from_slice(&encrypted);
    return_buffer(out)
}

fn normalize_and_validate(raw:&str)->Result<String,u8> {
    let value=raw.trim();
    if value.is_empty(){return Err(1);}
    if value.as_bytes().len()>254{return Err(2);}
    if !value.is_ascii(){return Err(3);}
    let mut parts=value.split('@');
    let local=parts.next().unwrap_or_default();
    let domain=parts.next().unwrap_or_default();
    if parts.next().is_some()||local.is_empty()||domain.is_empty(){return Err(4);}
    if local.len()>64||!valid_local(local){return Err(5);}
    let domain=domain.to_ascii_lowercase();
    if !valid_domain(&domain){return Err(6);}
    if is_disposable(&domain){return Err(7);}
    if is_junk_local(local){return Err(8);}
    Ok(format!("{}@{}",local,domain))
}
fn valid_local(local:&str)->bool {
    if local.starts_with('.')||local.ends_with('.')||local.contains(".."){return false;}
    local.bytes().all(|b| b.is_ascii_alphanumeric()||matches!(b,b'!'|b'#'|b'$'|b'%'|b'&'|b'\''|b'*'|b'+'|b'-'|b'/'|b'='|b'?'|b'^'|b'_'|b'`'|b'{'|b'|'|b'}'|b'~'|b'.'))
}
fn valid_domain(domain:&str)->bool {
    if domain.len()>253||!domain.contains('.')||domain.starts_with('.')||domain.ends_with('.'){return false;}
    let labels:Vec<&str>=domain.split('.').collect();
    if labels.len()<2{return false;}
    for label in &labels {
        if label.is_empty()||label.len()>63||label.starts_with('-')||label.ends_with('-'){return false;}
        if !label.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'){return false;}
    }
    let tld=labels.last().copied().unwrap_or_default();
    if tld.starts_with("xn--"){tld.len()>4}else{tld.len()>=2&&tld.bytes().all(|b|b.is_ascii_alphabetic())}
}
fn is_disposable(domain:&str)->bool {
    DISPOSABLE_DOMAINS.iter().any(|item|domain==*item||domain.ends_with(&format!(".{}",item)))
}
fn is_junk_local(local:&str)->bool {
    let compact:String=local.chars().filter(|c|!matches!(c,'.'|'_'|'+'|'-')).flat_map(|c|c.to_lowercase()).collect();
    if compact.len()>=3 {
        let mut chars=compact.chars();
        if let Some(first)=chars.next(){if chars.all(|c|c==first){return true;}}
    }
    JUNK_LOCAL_PARTS.iter().any(|item|compact==*item)
}
fn error(code:u8)->Vec<u8>{vec![ERROR_MARKER,code]}
fn return_buffer(out:Vec<u8>)->u64 {
    let len=out.len() as u32;if len==0{return 0;}
    let ptr=Box::into_raw(out.into_boxed_slice()) as *mut u8 as u32;
    ((len as u64)<<32)|ptr as u64
}
