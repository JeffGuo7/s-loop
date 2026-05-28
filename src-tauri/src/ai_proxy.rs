use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize)]
pub struct ProxyRequest {
    pub url: String,
    pub method: Option<String>,
    pub headers: HashMap<String, String>,
    pub body: String,
}

#[derive(Serialize)]
pub struct ProxyResponse {
    pub status: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}

#[tauri::command]
pub async fn ai_proxy(request: ProxyRequest) -> Result<ProxyResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let method = request.method.as_deref().unwrap_or("POST");
    let req_method = method
        .parse::<reqwest::Method>()
        .map_err(|e| format!("Invalid HTTP method: {}", e))?;

    let mut req = client.request(req_method, &request.url);

    for (key, value) in &request.headers {
        if !key.eq_ignore_ascii_case("content-type") {
            req = req.header(key.as_str(), value.as_str());
        }
    }

    if !request.body.is_empty() {
        req = req.header("Content-Type", "application/json");
        req = req.body(request.body.clone());
    }

    let response = req
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status().as_u16();
    let resp_headers: HashMap<String, String> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    Ok(ProxyResponse {
        status,
        body,
        headers: resp_headers,
    })
}
