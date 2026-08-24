use std::{ptr, slice, str};

const VERSION: u8 = 1;
const ERROR_MARKER: u8 = 0xff;
const SIGNATURE_LEN: usize = 32;

const PREREGISTER_SIGNATURE: [u8; SIGNATURE_LEN] = [
    149, 242, 234, 4, 116, 70, 202, 200, 187, 77, 202, 235, 241, 246, 220, 157,
    16, 239, 109, 121, 163, 251, 149, 231, 239, 26, 197, 248, 57, 204, 87, 67,
];

const CONTACT_SIGNATURE: [u8; SIGNATURE_LEN] = [
    89, 6, 47, 138, 230, 92, 10, 82, 249, 110, 139, 84, 157, 246, 196, 48,
    216, 71, 160, 41, 130, 135, 177, 65, 132, 179, 86, 204, 156, 4, 238, 144,
];

const TEST_SIGNATURE: [u8; SIGNATURE_LEN] = [
    66, 226, 58, 171, 227, 204, 243, 97, 174, 10, 170, 91, 56, 75, 23, 146,
    223, 234, 67, 137, 113, 147, 69, 190, 9, 60, 212, 101, 15, 103, 67, 28,
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
pub unsafe extern "C" fn signature_for_page(input_ptr: u32, input_len: u32) -> u64 {
    if input_ptr == 0 || input_len == 0 {
        return return_buffer(error(1));
    }

    let input = slice::from_raw_parts(input_ptr as *const u8, input_len as usize);
    let page_path = match str::from_utf8(input) {
        Ok(value) => value,
        Err(_) => return return_buffer(error(2)),
    };

    let file_name = page_path.rsplit('/').next().unwrap_or_default();
    let signature = match file_name {
        "preregister.html" => &PREREGISTER_SIGNATURE,
        "contact.html" => &CONTACT_SIGNATURE,
        "test.html" => &TEST_SIGNATURE,
        _ => return return_buffer(error(3)),
    };

    let mut out = Vec::with_capacity(1 + SIGNATURE_LEN);
    out.push(VERSION);
    out.extend_from_slice(signature);
    return_buffer(out)
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
