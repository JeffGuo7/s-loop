//! sloop-runbox — run a command inside a Windows AppContainer.
//!
//! Usage:
//!   sloop-runbox [--rw <dir>]... [--rx <dir>]... -- <exe> [args...]
//!
//! Security properties (enforced by the OS, not by this program's logic):
//!   * The child runs in an AppContainer profile with ZERO capabilities —
//!     without the internet capability there is no outbound network access.
//!   * The child's token carries the AppContainer SID, and access checks for
//!     such tokens additionally require an allow-ACE for that SID, so file
//!     access outside the explicitly granted directories is denied —
//!     including the user profile and other projects.
//!   * `--rw` grants read/write/execute on a directory tree, `--rx` grants
//!     read/execute (used e.g. for the shell installation directory).
//!     Existing DACL entries are merged, never replaced.
//!
//! stdio is passed through and the child's exit code becomes ours.

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::process::ExitCode;

use windows_sys::core::PWSTR;
use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, LocalFree, SetHandleInformation, GENERIC_EXECUTE, GENERIC_READ,
    GENERIC_WRITE, HANDLE_FLAG_INHERIT, INVALID_HANDLE_VALUE,
};
use windows_sys::Win32::Security::Authorization::{
    GetNamedSecurityInfoW, SetEntriesInAclW, SetNamedSecurityInfoW, EXPLICIT_ACCESS_W,
    GRANT_ACCESS, NO_MULTIPLE_TRUSTEE, SE_FILE_OBJECT, TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN,
    TRUSTEE_W,
};
use windows_sys::Win32::Security::Isolation::{
    CreateAppContainerProfile, DeriveAppContainerSidFromAppContainerName,
};
use windows_sys::Win32::Security::{
    ACL, DACL_SECURITY_INFORMATION, PSID, SECURITY_CAPABILITIES, SUB_CONTAINERS_AND_OBJECTS_INHERIT,
};
use windows_sys::Win32::Storage::FileSystem::DELETE;
use windows_sys::Win32::System::Console::{
    GetStdHandle, STD_ERROR_HANDLE, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE,
};
use windows_sys::Win32::System::Memory::{GetProcessHeap, HeapAlloc, HeapFree, HEAP_ZERO_MEMORY};
use windows_sys::Win32::System::Threading::{
    CreateProcessW, DeleteProcThreadAttributeList, GetExitCodeProcess,
    InitializeProcThreadAttributeList, UpdateProcThreadAttribute, WaitForSingleObject,
    EXTENDED_STARTUPINFO_PRESENT, INFINITE, LPPROC_THREAD_ATTRIBUTE_LIST, PROCESS_INFORMATION,
    PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES, STARTF_USESTDHANDLES, STARTUPINFOEXW,
};

const PROFILE_MONIKER: &str = "S-Loop.Runbox";

fn wide(s: &str) -> Vec<u16> {
    OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

unsafe fn last_error(message: &str) -> String {
    format!("{message} (error {})", GetLastError())
}

/// Strip the `\\?\` verbatim prefix: canonicalize() returns it, but cmd.exe
/// treats a `\\?\` cwd as a UNC path, refuses it, and silently drops the
/// command while falling back to C:\Windows. The plain form works everywhere
/// (the ACL APIs accept it too).
fn plain_path(canonical: &str) -> &str {
    canonical
        .strip_prefix(r"\\?\UNC\")
        .or_else(|| canonical.strip_prefix(r"\\?\"))
        .unwrap_or(canonical)
}

/// Quote one argument for the Microsoft C runtime argv parser, which bash
/// and most native tools use: wrap in quotes when it contains whitespace or
/// quotes, double backslashes that precede a quote, and escape quotes.
fn quote_arg(arg: &str) -> String {
    if !arg.is_empty() && !arg.contains([' ', '\t', '"']) {
        return arg.to_string();
    }
    let mut out = String::with_capacity(arg.len() + 2);
    out.push('"');
    let mut backslashes = 0;
    for ch in arg.chars() {
        match ch {
            '\\' => backslashes += 1,
            '"' => {
                out.push_str(&"\\".repeat(backslashes * 2 + 1));
                out.push('"');
                backslashes = 0;
            }
            _ => {
                out.push_str(&"\\".repeat(backslashes));
                backslashes = 0;
                out.push(ch);
            }
        }
    }
    out.push_str(&"\\".repeat(backslashes * 2));
    out.push('"');
    out
}

/// SID of the runbox AppContainer profile, creating the profile if needed.
unsafe fn app_container_sid() -> Result<PSID, String> {
    let moniker = wide(PROFILE_MONIKER);
    let display = wide("S-Loop Runbox");
    let desc = wide("Execution sandbox for S-Loop approved shell commands");
    let mut last_hr: i32 = 0;
    // First use on a fresh machine races when several runbox processes start
    // at once: one is still creating the profile while the others see
    // ERROR_ACCESS_DENIED or a not-yet-derivable SID. Retry create/derive
    // briefly instead of failing the command.
    for _attempt in 0..40 {
        let mut sid: PSID = std::ptr::null_mut();
        let hr = CreateAppContainerProfile(
            moniker.as_ptr(),
            display.as_ptr(),
            desc.as_ptr(),
            std::ptr::null(),
            0,
            &mut sid,
        );
        if hr == 0 && !sid.is_null() {
            return Ok(sid);
        }
        last_hr = hr;
        if DeriveAppContainerSidFromAppContainerName(moniker.as_ptr(), &mut sid) == 0
            && !sid.is_null()
        {
            return Ok(sid);
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    Err(format!(
        "CreateAppContainerProfile failed after retries: hr=0x{last_hr:08X}"
    ))
}

/// Add an allow-ACE for the AppContainer SID on `directory`, merging into the
/// existing DACL (propagating to children) so current access is preserved.
unsafe fn grant_on_directory(directory: &str, sid: PSID, access: u32) -> Result<(), String> {
    // TRUSTEE_IS_SID expects the SID pointer itself (binary), not its string
    // form — passing an S-1-… string here fails with ERROR_INVALID_PARAMETER.
    let entry = EXPLICIT_ACCESS_W {
        grfAccessPermissions: access,
        grfAccessMode: GRANT_ACCESS,
        grfInheritance: SUB_CONTAINERS_AND_OBJECTS_INHERIT,
        Trustee: TRUSTEE_W {
            pMultipleTrustee: std::ptr::null_mut(),
            MultipleTrusteeOperation: NO_MULTIPLE_TRUSTEE,
            TrusteeForm: TRUSTEE_IS_SID,
            TrusteeType: TRUSTEE_IS_UNKNOWN,
            ptstrName: sid as PWSTR,
        },
    };

    let dir_w = wide(directory);
    // Existing DACL: the merge source. Without it SetEntriesInAclW would build
    // a fresh ACL and SetNamedSecurityInfoW would strip the user's own access.
    let mut existing_dacl: *mut ACL = std::ptr::null_mut();
    let mut security_descriptor: *mut core::ffi::c_void = std::ptr::null_mut();
    let rc = GetNamedSecurityInfoW(
        dir_w.as_ptr(),
        SE_FILE_OBJECT,
        DACL_SECURITY_INFORMATION,
        std::ptr::null_mut(),
        std::ptr::null_mut(),
        &mut existing_dacl,
        std::ptr::null_mut(),
        &mut security_descriptor,
    );
    if rc != 0 {
        return Err(format!(
            "GetNamedSecurityInfoW failed for {directory}: {rc}"
        ));
    }

    let mut new_acl: *mut ACL = std::ptr::null_mut();
    let rc = SetEntriesInAclW(1, &entry, existing_dacl, &mut new_acl);
    LocalFree(security_descriptor as _);
    if rc != 0 {
        return Err(format!("SetEntriesInAclW failed for {directory}: {rc}"));
    }

    let rc = SetNamedSecurityInfoW(
        dir_w.as_ptr(),
        SE_FILE_OBJECT,
        DACL_SECURITY_INFORMATION,
        std::ptr::null_mut(),
        std::ptr::null_mut(),
        new_acl,
        std::ptr::null(),
    );
    LocalFree(new_acl as _);
    if rc != 0 {
        return Err(format!(
            "SetNamedSecurityInfoW failed for {directory}: {rc}"
        ));
    }
    Ok(())
}

unsafe fn spawn_in_container(
    app_sid: PSID,
    exe: &str,
    args: &[String],
    cwd: Option<&str>,
) -> Result<i32, String> {
    let mut size: usize = 0;
    InitializeProcThreadAttributeList(std::ptr::null_mut(), 1, 0, &mut size);
    if size == 0 {
        return Err(last_error(
            "InitializeProcThreadAttributeList sizing failed",
        ));
    }
    let buffer =
        HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, size) as LPPROC_THREAD_ATTRIBUTE_LIST;
    if buffer.is_null() {
        return Err("out of memory allocating attribute list".into());
    }
    if InitializeProcThreadAttributeList(buffer, 1, 0, &mut size) == 0 {
        return Err(last_error("InitializeProcThreadAttributeList failed"));
    }

    // Zero capabilities: no internet capability means no outbound network.
    let caps = SECURITY_CAPABILITIES {
        AppContainerSid: app_sid,
        Capabilities: std::ptr::null_mut(),
        CapabilityCount: 0,
        Reserved: 0,
    };
    if UpdateProcThreadAttribute(
        buffer,
        0,
        PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES as usize,
        &caps as *const SECURITY_CAPABILITIES as *const core::ffi::c_void,
        std::mem::size_of::<SECURITY_CAPABILITIES>(),
        std::ptr::null_mut(),
        std::ptr::null(),
    ) == 0
    {
        return Err(last_error("UpdateProcThreadAttribute failed"));
    }

    let mut cmdline = quote_arg(exe);
    for arg in args {
        cmdline.push(' ');
        cmdline.push_str(&quote_arg(arg));
    }
    let mut cmdline_w = wide(&cmdline);

    let mut si: STARTUPINFOEXW = std::mem::zeroed();
    si.StartupInfo.cb = std::mem::size_of::<STARTUPINFOEXW>() as u32;
    si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    // Without this assignment the attribute list exists but is not attached,
    // and the child runs with the full user token — no containment at all.
    si.lpAttributeList = buffer;
    for (slot, std_handle) in [
        (&mut si.StartupInfo.hStdInput, STD_INPUT_HANDLE),
        (&mut si.StartupInfo.hStdOutput, STD_OUTPUT_HANDLE),
        (&mut si.StartupInfo.hStdError, STD_ERROR_HANDLE),
    ] {
        let handle = GetStdHandle(std_handle);
        if !handle.is_null() && handle != INVALID_HANDLE_VALUE {
            SetHandleInformation(handle, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT);
            *slot = handle;
        }
    }

    let cwd_w = cwd.map(wide);
    let mut pi: PROCESS_INFORMATION = std::mem::zeroed();
    let created = CreateProcessW(
        std::ptr::null(),
        cmdline_w.as_mut_ptr(),
        std::ptr::null(),
        std::ptr::null(),
        1, // inherit handles (stdio)
        EXTENDED_STARTUPINFO_PRESENT,
        std::ptr::null(), // inherit our already-sanitized environment
        cwd_w
            .as_ref()
            .map(|w| w.as_ptr())
            .unwrap_or(std::ptr::null()),
        &si.StartupInfo,
        &mut pi,
    );
    DeleteProcThreadAttributeList(buffer);
    HeapFree(GetProcessHeap(), 0, buffer as _);
    if created == 0 {
        return Err(last_error(&format!("CreateProcessW failed for {exe}")));
    }

    WaitForSingleObject(pi.hProcess, INFINITE);
    let mut exit_code: u32 = 1;
    GetExitCodeProcess(pi.hProcess, &mut exit_code);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    Ok(exit_code as i32)
}

struct Usage;

struct BoxArgs {
    rw: Vec<String>,
    rx: Vec<String>,
    command: Vec<String>,
}

fn parse_args(argv: &[String]) -> Result<BoxArgs, Usage> {
    let mut rw = Vec::new();
    let mut rx = Vec::new();
    let mut i = 0;
    while i < argv.len() {
        match argv[i].as_str() {
            "--rw" => {
                i += 1;
                rw.push(argv.get(i).ok_or(Usage)?.clone());
            }
            "--rx" => {
                i += 1;
                rx.push(argv.get(i).ok_or(Usage)?.clone());
            }
            "--" => {
                let rest = argv[i + 1..].to_vec();
                if rest.is_empty() {
                    return Err(Usage);
                }
                return Ok(BoxArgs {
                    rw,
                    rx,
                    command: rest,
                });
            }
            other => {
                eprintln!("sloop-runbox: unknown argument {other}");
                return Err(Usage);
            }
        }
        i += 1;
    }
    Err(Usage)
}

fn main() -> ExitCode {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let BoxArgs {
        rw: rw_raw,
        rx: rx_raw,
        command,
    } = match parse_args(&argv) {
        Ok(parsed) => parsed,
        Err(Usage) => {
            eprintln!("usage: sloop-runbox [--rw <dir>]... [--rx <dir>]... -- <exe> [args...]");
            return ExitCode::from(2);
        }
    };
    // Canonicalize grant paths (backslash form, resolved, existing): the ACL
    // APIs reject forward-slash paths, and granting a non-existent directory
    // would silently protect nothing.
    let canonicalize = |dirs: &[String], flag: &str| -> Option<Vec<String>> {
        let mut out = Vec::with_capacity(dirs.len());
        for dir in dirs {
            match std::fs::canonicalize(dir) {
                Ok(path) => out.push(path.to_string_lossy().into_owned()),
                Err(err) => {
                    eprintln!("sloop-runbox: {flag} {dir}: {err}");
                    return None;
                }
            }
        }
        Some(out)
    };
    let (Some(rw_dirs), Some(rx_dirs)) =
        (canonicalize(&rw_raw, "--rw"), canonicalize(&rx_raw, "--rx"))
    else {
        return ExitCode::from(3);
    };

    unsafe {
        let app_sid = match app_container_sid() {
            Ok(sid) => sid,
            Err(err) => {
                eprintln!("sloop-runbox: {err}");
                return ExitCode::from(3);
            }
        };

        let rw_mask = GENERIC_READ | GENERIC_WRITE | GENERIC_EXECUTE | DELETE;
        let rx_mask = GENERIC_READ | GENERIC_EXECUTE;

        for dir in &rw_dirs {
            if let Err(err) = grant_on_directory(dir, app_sid, rw_mask) {
                eprintln!("sloop-runbox: {err}");
                return ExitCode::from(3);
            }
        }
        for dir in &rx_dirs {
            if let Err(err) = grant_on_directory(dir, app_sid, rx_mask) {
                eprintln!("sloop-runbox: {err}");
                return ExitCode::from(3);
            }
        }

        let exe = &command[0];
        let args: Vec<String> = command[1..].to_vec();
        let cwd = rw_dirs.first().map(|dir| plain_path(dir).to_string());
        match spawn_in_container(app_sid, exe, &args, cwd.as_deref()) {
            Ok(code) => ExitCode::from(code as u8),
            Err(err) => {
                eprintln!("sloop-runbox: {err}");
                ExitCode::from(3)
            }
        }
    }
}
