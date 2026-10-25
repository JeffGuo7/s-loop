//! Real-spawn sandbox tests: the AppContainer must let commands run and write
//! inside granted directories while denying writes anywhere else.

use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn runbox() -> Command {
    Command::new(env!("CARGO_BIN_EXE_sloop-runbox"))
}

fn workspace(tag: &str) -> PathBuf {
    // One directory per test: SetNamedSecurityInfoW on a shared path from
    // parallel tests races and fails with ERROR_INVALID_PARAMETER.
    let dir = std::env::temp_dir().join(format!("sloop-runbox-ws-{tag}"));
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn runs_a_command_inside_the_container() {
    let output = runbox()
        .arg("--rw")
        .arg(workspace("run"))
        .arg("--")
        .arg("cmd.exe")
        .arg("/c")
        .arg("echo sandbox-ok")
        .output()
        .expect("spawn runbox");
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("sandbox-ok"),
        "expected sandbox-ok in stdout, got {stdout:?} stderr {:?}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn denies_writes_outside_granted_directories() {
    let outside = std::env::var("USERPROFILE")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("sloop-runbox-deny-test.txt");
    let _ = fs::remove_file(&outside);

    let output = runbox()
        .arg("--rw")
        .arg(workspace("deny"))
        .arg("--")
        .arg("cmd.exe")
        .arg("/c")
        .arg(format!("echo x > {}", outside.display()))
        .output()
        .expect("spawn runbox");
    assert!(
        !outside.exists(),
        "write outside the granted directory must be denied (exit {}, stdout {:?} stderr {:?} cmd {:?})",
        output.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
        format!("echo x > {}", outside.display())
    );
    let _ = fs::remove_file(&outside);
}

#[test]
fn allows_writes_inside_granted_directory() {
    let ws = workspace("allow");
    let target = ws.join("allow-test.txt");
    let _ = fs::remove_file(&target);

    let output = runbox()
        .arg("--rw")
        .arg(&ws)
        .arg("--")
        .arg("cmd.exe")
        .arg("/c")
        .arg(format!("echo ok > {}", target.display()))
        .output()
        .expect("spawn runbox");
    assert!(
        target.exists(),
        "write inside the granted directory must succeed (exit {}, stderr {:?})",
        output.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&output.stderr)
    );
    let _ = fs::remove_file(&target);
}

#[test]
fn exit_code_propagates() {
    let output = runbox()
        .arg("--rw")
        .arg(workspace("exit"))
        .arg("--")
        .arg("cmd.exe")
        .arg("/c")
        .arg("exit 7")
        .output()
        .expect("spawn runbox");
    assert_eq!(output.status.code(), Some(7));
}

#[test]
fn blocks_network_access() {
    // Zero capabilities: without the internetClient capability the AppContainer
    // cannot open outbound sockets or resolve DNS. curl.exe ships with Windows.
    let ws = workspace("net");
    let output = runbox()
        .arg("--rw")
        .arg(&ws)
        .arg("--")
        .arg("curl.exe")
        .arg("-s")
        .arg("-m")
        .arg("5")
        .arg("-o")
        .arg("NUL")
        .arg("-w")
        .arg("%{http_code}")
        .arg("https://example.com")
        .output()
        .expect("spawn runbox");
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert_ne!(
        output.status.code(),
        Some(0),
        "network request must fail inside the container (stdout {stdout:?})"
    );
    if let Ok(stderr) = String::from_utf8(output.stderr) {
        assert!(
            !stderr.contains("sloop-runbox:"),
            "runbox itself must not fail: {stderr}"
        );
    }
}
