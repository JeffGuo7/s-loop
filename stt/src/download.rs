use std::{env, time::Duration};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const READ_TIMEOUT: Duration = Duration::from_secs(90);

pub(crate) fn agent() -> ureq::Agent {
    let mut builder = base_builder();
    if let Some(proxy_url) = configured_proxy() {
        if let Ok(proxy) = ureq::Proxy::new(proxy_url) {
            builder = builder.proxy(proxy);
        }
    }
    builder.build()
}

pub(crate) fn direct_agent() -> ureq::Agent {
    base_builder().build()
}

fn base_builder() -> ureq::AgentBuilder {
    ureq::AgentBuilder::new()
        .timeout_connect(CONNECT_TIMEOUT)
        .timeout_read(READ_TIMEOUT)
        .user_agent("S-Loop voice model downloader")
}

fn configured_proxy() -> Option<String> {
    [
        "ALL_PROXY",
        "all_proxy",
        "HTTPS_PROXY",
        "https_proxy",
        "HTTP_PROXY",
        "http_proxy",
    ]
    .into_iter()
    .find_map(|name| {
        env::var(name)
            .ok()
            .and_then(|value| normalize_proxy(&value))
    })
    .or_else(windows_user_proxy)
}

fn normalize_proxy(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    if value.contains("://") {
        Some(value.to_owned())
    } else {
        Some(format!("http://{value}"))
    }
}

#[cfg(windows)]
fn windows_user_proxy() -> Option<String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    let settings = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
        .ok()?;
    let enabled = settings.get_value::<u32, _>("ProxyEnable").unwrap_or(0);
    if enabled == 0 {
        return None;
    }
    let value = settings.get_value::<String, _>("ProxyServer").ok()?;
    parse_windows_proxy(&value)
}

#[cfg(not(windows))]
fn windows_user_proxy() -> Option<String> {
    None
}

fn parse_windows_proxy(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    if !value.contains('=') {
        return normalize_proxy(value);
    }

    let entries: Vec<(&str, &str)> = value
        .split(';')
        .filter_map(|entry| entry.split_once('='))
        .map(|(protocol, address)| (protocol.trim(), address.trim()))
        .collect();
    ["https", "http", "socks"].into_iter().find_map(|protocol| {
        entries
            .iter()
            .find(|(candidate, _)| candidate.eq_ignore_ascii_case(protocol))
            .and_then(|(_, address)| {
                if protocol == "socks" && !address.contains("://") {
                    Some(format!("socks5://{address}"))
                } else {
                    normalize_proxy(address)
                }
            })
    })
}

#[cfg(test)]
mod tests {
    use super::{agent, direct_agent, normalize_proxy, parse_windows_proxy};

    #[test]
    fn normalizes_proxy_without_a_scheme() {
        assert_eq!(
            normalize_proxy("127.0.0.1:7890").as_deref(),
            Some("http://127.0.0.1:7890")
        );
    }

    #[test]
    fn keeps_an_explicit_proxy_scheme() {
        assert_eq!(
            normalize_proxy("http://127.0.0.1:7890").as_deref(),
            Some("http://127.0.0.1:7890")
        );
    }

    #[test]
    fn selects_https_from_a_windows_protocol_map() {
        assert_eq!(
            parse_windows_proxy("http=127.0.0.1:7890;https=127.0.0.1:7891").as_deref(),
            Some("http://127.0.0.1:7891")
        );
    }

    #[test]
    fn recognizes_a_windows_socks_proxy() {
        assert_eq!(
            parse_windows_proxy("socks=127.0.0.1:7891").as_deref(),
            Some("socks5://127.0.0.1:7891")
        );
    }

    #[test]
    #[ignore = "manual external-network diagnostic"]
    fn reaches_modelscope_directly_and_github_through_the_configured_proxy() {
        let modelscope = direct_agent()
            .get("https://www.modelscope.cn/models/budaoshou/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20/resolve/658a5257f1342768b148d8b51c87e52a4e012262/tokens.txt")
            .set("Range", "bytes=0-0")
            .call()
            .expect("ModelScope should be reachable without a proxy");
        assert!(matches!(modelscope.status(), 200 | 206));

        let github = agent()
            .get("https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx")
            .set("Range", "bytes=0-0")
            .call()
            .expect("GitHub should be reachable through the configured proxy");
        assert!(matches!(github.status(), 200 | 206));
    }
}
